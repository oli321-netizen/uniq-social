import { spawn } from "child_process";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { ContentKind, EditorSettings, ReadResult, Segment, Shot, VariantPlan } from "@/lib/ai-editor/types";

const MIN_SEG = 1;
const MIN_REEL = 7;
const MAX_REEL = 30;

export type PlanCheck = {
  ok: boolean;
  issues: string[];
  repaired: boolean;
  notes: string[];
};

export const EDITOR_GUIDANCE = [
  "Barber or haircut: one continuous action. Keep each pass whole. Order is before, the work, then the reveal. Never start or stop in the middle of a pass. End on the reveal. About 12 to 25 seconds.",
  "Talking head: open on the strongest full sentence, then the rest in order, with no line repeated. Cut only when a sentence ends. Drop dead air. About 7 to 25 seconds.",
  "Product: open on the clearest view of the product. Do not repeat the same angle. About 7 to 20 seconds.",
  "Gym: one move per shot. Do not cut mid-rep. Order is setup, the effort, then the finish. About 8 to 20 seconds.",
  "Food: keep each step whole, prep then cook then plate. End on the finished plate. About 10 to 25 seconds.",
  "Before and after: both stay in. The after is last. Do not intercut them.",
].join("\n");

export function visionModels() {
  const preferred = (process.env.OPENAI_MODEL || "gpt-4o").trim() || "gpt-4o";
  return preferred === "gpt-4o-mini" ? [preferred] : [preferred, "gpt-4o-mini"];
}

export function verifyPlans(plans: VariantPlan[], read: ReadResult): { plans: VariantPlan[]; checks: PlanCheck[] } {
  const checks: PlanCheck[] = [];
  const next: VariantPlan[] = [];
  const seen: string[] = [];
  plans.forEach((plan, index) => {
    const repaired = repairPlan(plan, read, index, seen);
    next.push(repaired.plan);
    checks.push(repaired.check);
    seen.push(signature(repaired.plan));
  });
  return { plans: next, checks };
}

export function saferPlan(read: ReadResult, settings: EditorSettings, index: number): VariantPlan {
  const shots = mergeTiny(read.shots);
  const process = isProcess(read.kind);
  let segments = shots.map((shot) => ({ start: shot.start, end: shot.end }));
  if (!process) {
    const best = [...shots].sort((a, b) => b.quality - a.quality)[index % Math.max(1, shots.length)];
    const rest = shots.filter((shot) => shot !== best).sort((a, b) => a.start - b.start);
    segments = [best, ...rest].map((shot) => ({ start: shot.start, end: shot.end }));
  }
  segments = fitLength(segments, shots, read, process);
  return {
    title: shots[0]?.summary || `Edit ${index + 1}`,
    why: process
      ? "Kept each step whole and in order so the process is not cut in half."
      : "Opened on the strongest moment and left out anything too short.",
    segments: segments.length ? segments : [{ start: 0, end: round2(Math.min(read.duration, MAX_REEL)) }],
    speed: 1,
    silence: read.kind === "talking",
    zoom: false,
    zoomScale: 1.12,
    captions: settings.captions,
    captionStyle: settings.captionStyle,
    captionPosition: "bottom",
    fontSize: 64,
    keepOriginal: settings.keepOriginal,
    musicVolume: Math.min(settings.musicVolume, 0.4),
    musicOffset: 0,
    duck: settings.duck,
    fade: settings.fade,
  };
}

function repairPlan(plan: VariantPlan, read: ReadResult, index: number, seen: string[]): { plan: VariantPlan; check: PlanCheck } {
  const issues: string[] = [];
  const notes: string[] = [];
  let repaired = false;
  const process = isProcess(read.kind);
  const shots = mergeTiny(read.shots);
  let segments = plan.segments.map((segment) => ({ ...segment }));

  const snapped = segments.map((segment) => snapToShots(segment, shots, process));
  if (JSON.stringify(snapped) !== JSON.stringify(segments)) {
    issues.push("Cut inside a continuous action.");
    repaired = true;
  }
  segments = dedupe(snapped.filter((segment) => segment.end - segment.start >= 0.2));

  const grown: Segment[] = [];
  for (const segment of segments) {
    if (segment.end - segment.start >= MIN_SEG) {
      grown.push(segment);
      continue;
    }
    issues.push("Clip under 1 second.");
    repaired = true;
    const prev = grown[grown.length - 1];
    if (prev && segment.start - prev.end < 0.4) prev.end = round2(Math.max(prev.end, segment.end));
  }
  segments = grown.filter((segment) => segment.end - segment.start >= MIN_SEG);

  if (process) segments = segments.slice().sort((a, b) => a.start - b.start);
  const lengthBefore = composed({ ...plan, segments });
  const fitted = fitLength(segments, shots, read, process);
  if (JSON.stringify(fitted) !== JSON.stringify(segments) || (read.duration >= MIN_REEL && (lengthBefore < MIN_REEL || lengthBefore > MAX_REEL))) {
    if (lengthBefore > MAX_REEL) issues.push("Longer than a Reel.");
    if (read.duration >= MIN_REEL && lengthBefore < MIN_REEL) issues.push("Shorter than a Reel.");
    repaired = repaired || JSON.stringify(fitted) !== JSON.stringify(segments);
  }
  segments = fitted;

  if (!process && segments.length) {
    const best = bestShot(shots, index);
    if (best && !covers(segments[0], best)) {
      const existing = segments.find((segment) => covers(segment, best));
      const opening = existing || { start: best.start, end: best.end };
      const rest = segments.filter((segment) => segment !== existing && !rangesOverlap(segment, opening, 0.25));
      issues.push("Hook was not the strongest moment.");
      repaired = true;
      segments = [opening, ...rest];
    }
  } else if (process && shots.length) {
    const reveal = shots[shots.length - 1];
    if (!segments.some((segment) => covers(segment, reveal))) {
      segments.push({ start: reveal.start, end: reveal.end });
      issues.push("Reveal was missing.");
      repaired = true;
    }
    segments = segments.slice().sort((a, b) => a.start - b.start);
  }

  segments = dedupe(segments).slice(0, 8);
  let next: VariantPlan = { ...plan, segments: segments.length ? segments : [{ start: 0, end: round2(Math.min(read.duration, MAX_REEL)) }] };

  const sign = signature(next);
  if (seen.includes(sign)) {
    if (shots.length > 1) {
      issues.push("Same shots as another variant.");
      repaired = true;
      const shifted = saferPlan(read, blankSettings(plan), index + seen.length + 1);
      shifted.speed = plan.speed === 1 ? 1.06 : 1;
      shifted.zoom = !plan.zoom;
      next = { ...shifted, captions: plan.captions, captionStyle: plan.captionStyle, keepOriginal: plan.keepOriginal, musicVolume: plan.musicVolume, duck: plan.duck, fade: plan.fade };
    } else {
      notes.push("Only one shot, so the variants keep it whole and change the pace.");
      if (index > 0 && next.speed === 1 && !next.zoom) next = { ...next, speed: 1.06 };
    }
  }
  if (read.duration < MIN_REEL) notes.push("Source is under 7 seconds, so the edit stays the full clip.");

  const still = remainingIssues(next, read, seen);
  if (still.length) {
    const safe = saferPlan(read, blankSettings(plan), index + 3);
    safe.captions = plan.captions;
    safe.captionStyle = plan.captionStyle;
    safe.keepOriginal = plan.keepOriginal;
    safe.musicVolume = plan.musicVolume;
    safe.duck = plan.duck;
    safe.fade = plan.fade;
    if (index > 0) safe.speed = 1.05;
    next = safe;
    repaired = true;
    issues.push(...still.map((issue) => `Replanned: ${issue}`));
  }

  const left = remainingIssues(next, read, seen).filter((issue) => !(read.duration < MIN_REEL && issue.startsWith("Shorter")));
  return {
    plan: next,
    check: { ok: left.length === 0, issues, repaired, notes },
  };
}

function remainingIssues(plan: VariantPlan, read: ReadResult, seen: string[]) {
  const issues: string[] = [];
  const process = isProcess(read.kind);
  const shots = mergeTiny(read.shots);
  for (const segment of plan.segments) {
    if (segment.end - segment.start < MIN_SEG - 0.05) issues.push("Clip under 1 second.");
    if (cutsInside(segment, shots, process)) issues.push("Cut inside a continuous action.");
  }
  const span = composed(plan);
  if (read.duration >= MIN_REEL && span > MAX_REEL + 0.4) issues.push("Longer than a Reel.");
  if (seen.includes(signature(plan)) && shots.length > 1) issues.push("Same shots as another variant.");
  return Array.from(new Set(issues));
}

function fitLength(segments: Segment[], shots: Shot[], read: ReadResult, process: boolean) {
  let next = segments.map((segment) => ({ ...segment }));
  const guard = (list: Segment[]) => {
    const span = list.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
    return span;
  };
  while (guard(next) > MAX_REEL && next.length > 1) {
    const middle = next.slice(1, -1);
    if (!middle.length) {
      next[0].end = round2(next[0].start + MAX_REEL);
      break;
    }
    const worst = middle.reduce((best, segment) => (qualityOf(segment, shots) < qualityOf(best, shots) ? segment : best));
    next = next.filter((segment) => segment !== worst);
  }
  if (read.duration >= MIN_REEL && guard(next) < MIN_REEL) {
    const unused = shots.filter((shot) => !next.some((segment) => rangesOverlap(segment, shot, 0.2)));
    for (const shot of unused.sort((a, b) => b.quality - a.quality)) {
      if (guard(next) >= MIN_REEL) break;
      next.push({ start: shot.start, end: shot.end });
    }
    if (process) next.sort((a, b) => a.start - b.start);
  }
  return dedupe(next);
}

function snapToShots(segment: Segment, shots: Shot[], process: boolean): Segment {
  const host = shots.find((shot) => (process || shot.continuous) && cutsInside(segment, [shot], true));
  if (!host) return { start: round2(segment.start), end: round2(segment.end) };
  return { start: round2(host.start), end: round2(host.end) };
}

function cutsInside(segment: Segment, shots: Shot[], process: boolean) {
  return shots.some((shot) => {
    if (!process && !shot.continuous) return false;
    const startsInside = segment.start > shot.start + 0.2 && segment.start < shot.end - 0.2;
    const endsInside = segment.end > shot.start + 0.2 && segment.end < shot.end - 0.2;
    return startsInside || endsInside;
  });
}

function mergeTiny(shots: Shot[]): Shot[] {
  const ordered = shots.slice().sort((a, b) => a.start - b.start);
  const merged: Shot[] = [];
  for (const shot of ordered) {
    const prev = merged[merged.length - 1];
    if (shot.end - shot.start < MIN_SEG && prev) {
      prev.end = shot.end;
      prev.summary = prev.summary || shot.summary;
      continue;
    }
    merged.push({ ...shot });
  }
  return merged.filter((shot) => shot.end - shot.start >= 0.35);
}

function dedupe(segments: Segment[]) {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.end - segment.start < 0.35) continue;
    const hit = out.find((prev) => rangesOverlap(prev, segment, 0.3));
    if (hit) {
      if (segment.end - segment.start > hit.end - hit.start) {
        hit.start = segment.start;
        hit.end = segment.end;
      }
      continue;
    }
    out.push({ ...segment });
  }
  return out;
}

function bestShot(shots: Shot[], index: number) {
  if (!shots.length) return null;
  const ranked = shots.slice().sort((a, b) => b.quality - a.quality || a.start - b.start);
  return ranked[index % ranked.length] || ranked[0];
}

function qualityOf(segment: Segment, shots: Shot[]) {
  const shot = shots.find((item) => rangesOverlap(item, segment, 0.2));
  return shot?.quality ?? 0.4;
}

function covers(segment: Segment, shot: { start: number; end: number }) {
  return segment.start <= shot.start + 0.25 && segment.end >= shot.end - 0.25;
}

function rangesOverlap(a: Segment, b: { start: number; end: number }, pad: number) {
  return a.end > b.start + pad && b.end > a.start + pad;
}

function composed(plan: Pick<VariantPlan, "segments" | "speed">) {
  const span = plan.segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
  return span / (plan.speed || 1);
}

function signature(plan: VariantPlan) {
  return plan.segments.map((segment) => `${segment.start.toFixed(1)}-${segment.end.toFixed(1)}`).join("|");
}

function isProcess(kind: ContentKind) {
  return kind === "process" || kind === "before-after" || kind === "food" || kind === "gym";
}

function blankSettings(plan: VariantPlan): EditorSettings {
  return {
    variants: 1,
    captions: plan.captions,
    captionStyle: plan.captionStyle,
    mode: "auto",
    prompt: "",
    keepOriginal: plan.keepOriginal,
    musicVolume: plan.musicVolume,
    duck: plan.duck,
    fade: plan.fade,
    beatSync: false,
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function renderWithCheck(input: {
  plan: VariantPlan;
  safer: VariantPlan;
  render: (plan: VariantPlan) => Promise<void>;
  inspect: () => Promise<{ ok: boolean; issues: string[]; duration: number }>;
}) {
  const first = await attempt(input.plan, input.render, input.inspect);
  if (first.ok) return { ok: true, retried: false, used: input.plan, first, second: null as { ok: boolean; issues: string[]; duration: number } | null };
  const second = await attempt(input.safer, input.render, input.inspect);
  return { ok: second.ok, retried: true, used: input.safer, first, second };
}

async function attempt(plan: VariantPlan, render: (plan: VariantPlan) => Promise<void>, inspect: () => Promise<{ ok: boolean; issues: string[]; duration: number }>) {
  try {
    await render(plan);
  } catch (error) {
    return { ok: false, issues: [error instanceof Error ? error.message : "Render failed"], duration: 0 };
  }
  return inspect();
}

export async function checkOutput(file: string, expect: { audio: boolean; sourceDuration: number; motion: boolean }) {
  const issues: string[] = [];
  let duration = 0;
  let width = 0;
  let height = 0;
  let hasVideo = false;
  let hasAudio = false;
  try {
    const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file]);
    const data = JSON.parse(probe) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
    duration = Number(data.format?.duration || 0);
    for (const stream of data.streams || []) {
      if (stream.codec_type === "video" && stream.width && stream.height) {
        hasVideo = true;
        width = stream.width;
        height = stream.height;
      }
      if (stream.codec_type === "audio") hasAudio = true;
    }
  } catch {
    return { ok: false, issues: ["Could not read the rendered file."], duration: 0 };
  }
  if (!hasVideo || width < 2 || height < 2) issues.push("No video.");
  if (!(duration > 0.8)) issues.push("Too short to play.");
  if (expect.sourceDuration >= MIN_REEL && duration > MAX_REEL + 5) issues.push("Longer than a Reel.");
  if (expect.sourceDuration >= 10 && duration < 4) issues.push("Edit came out too short.");
  const frames = await sampleLuma(file, duration);
  if (frames.length >= 2 && frames.every((frame) => frame.mean < 14)) issues.push("Picture is black.");
  if (expect.motion && duration > 2 && frames.length >= 2 && frames.every((frame) => frame.hash === frames[0].hash)) issues.push("Picture is frozen.");
  if (expect.audio) {
    if (!hasAudio) issues.push("Missing audio.");
    else {
      const mean = await meanVolume(file);
      if (mean === null || mean < -50) issues.push("Audio is too quiet.");
      if (mean !== null && mean > -2) issues.push("Audio is distorted.");
    }
  }
  return { ok: issues.length === 0, issues, duration };
}

async function sampleLuma(file: string, duration: number) {
  const times = [0.15, duration * 0.5, Math.max(0.2, duration - 0.2)];
  const frames: { mean: number; hash: string }[] = [];
  for (const time of times) {
    try {
      const raw = await runBuffer("ffmpeg", ["-v", "error", "-ss", time.toFixed(2), "-i", file, "-an", "-frames:v", "1", "-vf", "scale=16:16", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
      if (raw.length < 16) continue;
      let sum = 0;
      for (let index = 0; index < raw.length; index += 1) sum += raw[index];
      frames.push({ mean: sum / raw.length, hash: raw.subarray(0, 64).toString("hex") });
    } catch {
      /* one missed sample is not a failure */
    }
  }
  return frames;
}

async function meanVolume(file: string) {
  try {
    const stderr = await run("ffmpeg", ["-v", "info", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
    const match = /mean_volume:\s*(-?[0-9.]+)\s*dB/.exec(stderr);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function logEdit(dir: string, entry: Record<string, unknown>) {
  const file = path.join(dir, "edit-log.json");
  let current: unknown[] = [];
  try {
    current = JSON.parse(await readFile(file, "utf8")) as unknown[];
    if (!Array.isArray(current)) current = [];
  } catch {
    current = [];
  }
  current.push({ at: new Date().toISOString(), ...entry });
  await writeFile(file, JSON.stringify(current, null, 2));
  console.info(`[ai-editor] ${JSON.stringify(entry)}`);
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout || stderr);
      else reject(new Error(stderr.slice(-200) || `${command} failed`));
    });
  });
}

function runBuffer(command: string, args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${command} failed`));
    });
  });
}
