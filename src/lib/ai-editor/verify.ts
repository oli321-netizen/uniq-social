import { spawn } from "child_process";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { ContentKind, EditorSettings, ReadResult, Segment, Shot, VariantPlan } from "@/lib/ai-editor/types";

const MIN_SEG = 1;
const MIN_REEL = 7;
const MAX_REEL = 30;
const LONG_SOURCE = 12;

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

export function outputLimit(duration: number) {
  if (!(duration > LONG_SOURCE)) return round2(Math.min(MAX_REEL, Math.max(0.4, duration)));
  return round2(Math.min(MAX_REEL, duration * 0.85));
}

export function matchesSource(plan: Pick<VariantPlan, "segments">, duration: number) {
  if (!(duration > LONG_SOURCE)) return false;
  if (!plan.segments.length) return true;
  if (sourceCoverage(plan.segments) > duration * 0.9) return true;
  if (plan.segments.length === 1 && plan.segments[0].start <= 0.35 && plan.segments[0].end >= duration - 0.35) return true;
  return false;
}

export function planSegments(read: ReadResult, index: number): Segment[] {
  const duration = Math.max(0.4, read.duration);
  const shots = mergeTiny(read.shots);
  if (!(duration > LONG_SOURCE)) return shortSegments(read, shots.length ? shots : [fullShot(duration)], index);
  if (shots.length <= 1) return [longWindow(shots[0] || fullShot(duration), index, duration)];
  const process = isProcess(read.kind);
  if (process) return processWindows(shots, index, duration);
  if (read.kind === "talking") return talkingWindows(shots, index, duration);
  return montageWindows(shots, index, duration);
}

export function saferPlan(read: ReadResult, settings: EditorSettings, index: number): VariantPlan {
  const shots = mergeTiny(read.shots);
  const segments = planSegments(read, index);
  const process = isProcess(read.kind);
  return {
    title: shots[0]?.summary || `Edit ${index + 1}`,
    why: process
      ? "Kept the ending, stayed in order, and cut this shorter than the original."
      : "Cut a shorter edit so this is not the same as the original.",
    segments: segments.length ? segments : [longWindow(fullShot(read.duration), index, read.duration)],
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

function shortSegments(read: ReadResult, shots: Shot[], index: number): Segment[] {
  const duration = Math.max(0.4, read.duration);
  const asSegments = (list: Shot[]) => dedupe(list.map((shot) => ({ start: round2(shot.start), end: round2(Math.min(duration, shot.end)) }))).slice(0, 8);
  if (shots.length <= 1) return asSegments(shots);
  if (isProcess(read.kind)) {
    const ordered = shots.slice().sort((a, b) => a.start - b.start);
    if (index % 2 === 1 && ordered.length >= 3) {
      const middle = ordered.slice(1, -1);
      const worst = middle.reduce((best, shot) => (shot.quality < best.quality ? shot : best));
      return asSegments(ordered.filter((shot) => shot !== worst));
    }
    return asSegments(ordered);
  }
  if (read.kind === "talking") {
    const open = shots[index % shots.length];
    const rest = shots.filter((shot) => shot !== open).sort((a, b) => a.start - b.start);
    return asSegments([open, ...rest]);
  }
  const shift = index % shots.length;
  const rotated = shots.slice(shift).concat(shots.slice(0, shift));
  const drop = index % 3 === 2 && rotated.length > 3 ? 1 : 0;
  return asSegments(rotated.slice(0, Math.max(2, rotated.length - drop)));
}

function fullShot(duration: number): Shot {
  return { start: 0, end: duration, summary: "The whole clip", quality: 0.6, continuous: true };
}

function longWindow(shot: Shot, index: number, duration: number): Segment {
  const span = Math.max(0.4, shot.end - shot.start);
  const cap = outputLimit(Math.max(duration, shot.end));
  const shortest = Math.min(MIN_REEL, Math.max(0.4, span - 0.35));
  const step = span > LONG_SOURCE ? Math.max(0.45, (Math.min(cap, span - 0.35) - shortest) / 9) : 0;
  const length = round2(Math.min(span - (span > LONG_SOURCE ? 0.35 : 0), Math.max(shortest, Math.min(cap, cap - (index % 10) * step))));
  const room = Math.max(0, span - length);
  const anchor = index % 3;
  const offset = anchor === 0 ? room : anchor === 1 ? 0 : room / 2;
  const start = round2(Math.min(Math.max(shot.start, shot.end - length), shot.start + offset));
  const end = round2(Math.min(shot.end, Math.max(start + 0.35, start + length)));
  return { start, end };
}

function processWindows(shots: Shot[], index: number, duration: number): Segment[] {
  const ordered = shots.slice().sort((a, b) => a.start - b.start);
  const reveal = ordered[ordered.length - 1];
  const body = ordered.slice(0, -1);
  const limit = outputLimit(duration);
  const revealLen = reveal.end - reveal.start;
  if (body.length && index % (body.length + 1) === body.length && revealLen >= MIN_REEL && revealLen <= limit + 0.05) {
    return [{ start: round2(reveal.start), end: round2(reveal.end) }];
  }
  if (revealLen > limit + 0.05) return [longWindow(reveal, index, duration)];
  const picked: Shot[] = [];
  let total = revealLen;
  const startAt = body.length ? index % body.length : 0;
  for (let step = 0; step < body.length; step += 1) {
    const shot = body[(startAt + step) % body.length];
    const len = shot.end - shot.start;
    if (total + len <= limit + 0.05) {
      picked.push(shot);
      total += len;
    }
  }
  picked.push(reveal);
  picked.sort((a, b) => a.start - b.start);
  const segments = picked.map((shot) => ({ start: round2(shot.start), end: round2(shot.end) }));
  if (sourceCoverage(segments) > duration * 0.9) return [longWindow(fullShot(duration), index, duration)];
  return segments;
}

function talkingWindows(shots: Shot[], index: number, duration: number): Segment[] {
  if (shots.length === 1) return [longWindow(shots[0], index, duration)];
  const limit = outputLimit(duration);
  const open = shots[index % shots.length];
  const rest = shots.filter((shot) => shot !== open).sort((a, b) => a.start - b.start);
  const picked: Shot[] = [open];
  let total = open.end - open.start;
  if (total > limit + 0.05) return [longWindow(open, index, duration)];
  for (const shot of rest) {
    const len = shot.end - shot.start;
    if (total + len <= limit + 0.05) {
      picked.push(shot);
      total += len;
    }
  }
  return picked.map((shot) => ({ start: round2(shot.start), end: round2(shot.end) }));
}

function montageWindows(shots: Shot[], index: number, duration: number): Segment[] {
  const limit = outputLimit(duration);
  const shift = index % shots.length;
  const rotated = shots.slice(shift).concat(shots.slice(0, shift));
  const picked: Segment[] = [];
  let total = 0;
  for (const shot of rotated) {
    const len = shot.end - shot.start;
    if (picked.length >= 1 && total + len > limit + 0.05) continue;
    if (!picked.length && len > limit + 0.05) {
      picked.push(longWindow(shot, index, duration));
      break;
    }
    picked.push({ start: round2(shot.start), end: round2(shot.end) });
    total += len;
    if (total >= Math.min(limit, 18)) break;
  }
  if (!picked.length) return [longWindow(shots[0], index, duration)];
  if (sourceCoverage(picked) > duration * 0.9) return [longWindow(fullShot(duration), index, duration)];
  return picked;
}

function sourceCoverage(segments: Segment[]) {
  const ordered = segments.slice().sort((a, b) => a.start - b.start);
  let covered = 0;
  let cursor = 0;
  for (const segment of ordered) {
    const start = Math.max(segment.start, cursor);
    if (segment.end > start) covered += segment.end - start;
    cursor = Math.max(cursor, segment.end);
  }
  return covered;
}

function repairPlan(plan: VariantPlan, read: ReadResult, index: number, seen: string[]): { plan: VariantPlan; check: PlanCheck } {
  const issues: string[] = [];
  const notes: string[] = [];
  let repaired = false;
  const process = isProcess(read.kind);
  const shots = mergeTiny(read.shots);
  let segments = plan.segments.map((segment) => ({ ...segment }));
  if (!segments.length || matchesSource({ segments }, read.duration) || sourceCoverage(segments) > outputLimit(read.duration) + 0.45) {
    segments = planSegments(read, index);
    issues.push("Edit matched the whole clip.");
    repaired = true;
  }

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
  let next: VariantPlan = { ...plan, segments: segments.length ? segments : planSegments(read, index) };

  const sign = signature(next);
  if (seen.includes(sign)) {
    const shifted = saferPlan(read, blankSettings(plan), index + seen.length + 1);
    const shiftedSign = signature(shifted);
    if (shiftedSign !== sign && !seen.includes(shiftedSign)) {
      issues.push("Same shots as another variant.");
      repaired = true;
      next = {
        ...shifted,
        captions: plan.captions,
        captionStyle: plan.captionStyle,
        keepOriginal: plan.keepOriginal,
        musicVolume: plan.musicVolume,
        duck: plan.duck,
        fade: plan.fade,
        speed: 1,
      };
    } else if (read.duration > LONG_SOURCE) {
      issues.push("Same shots as another variant.");
      repaired = true;
    } else {
      notes.push("Only one arrangement fits, so this version changes the pace.");
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
  const limit = outputLimit(read.duration);
  if (read.duration >= MIN_REEL && (span > limit + 0.45 || span > MAX_REEL + 0.4)) issues.push("Longer than a Reel.");
  if (matchesSource(plan, read.duration)) issues.push("Edit matches the source.");
  if (read.duration > LONG_SOURCE && seen.includes(signature(plan))) issues.push("Same shots as another variant.");
  return Array.from(new Set(issues));
}

function fitLength(segments: Segment[], shots: Shot[], read: ReadResult, process: boolean) {
  let next = segments.map((segment) => ({ ...segment }));
  const limit = outputLimit(read.duration);
  const guard = (list: Segment[]) => {
    const span = list.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
    return span;
  };
  while (guard(next) > limit + 0.05 && next.length > 1) {
    const middle = next.slice(1, -1);
    if (!middle.length) break;
    const worst = middle.reduce((best, segment) => (qualityOf(segment, shots) < qualityOf(best, shots) ? segment : best));
    const rest = guard(next) - (worst.end - worst.start);
    if (read.duration > LONG_SOURCE && rest < MIN_REEL && rest <= limit) break;
    next = next.filter((segment) => segment !== worst);
  }
  if (next.length === 1 && guard(next) > limit + 0.05) {
    const window = longWindow(
      { start: next[0].start, end: next[0].end, summary: "", quality: 0.5, continuous: true },
      process ? 0 : 1,
      read.duration,
    );
    next[0].start = window.start;
    next[0].end = window.end;
  }
  if (read.duration >= MIN_REEL && guard(next) < MIN_REEL) {
    const unused = shots.filter((shot) => !next.some((segment) => rangesOverlap(segment, shot, 0.2)));
    for (const shot of unused.sort((a, b) => b.quality - a.quality)) {
      if (guard(next) >= MIN_REEL) break;
      const added = guard(next) + (shot.end - shot.start);
      if (added > limit + 0.05) continue;
      if (read.duration > LONG_SOURCE && sourceCoverage([...next, { start: shot.start, end: shot.end }]) > read.duration * 0.9) continue;
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
    if (shot.end - shot.start > LONG_SOURCE) return false;
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

export function editFailure(issues: string[]) {
  const text = issues.join(" ");
  if (/black/i.test(text)) return "That edit had a black stretch, so it was not saved.";
  if (/frozen|freeze/i.test(text)) return "That edit froze, so it was not saved.";
  if (/matches the source|whole clip|real edit/i.test(text)) return "Couldn't make a real edit from that clip.";
  return "Could not finish that edit.";
}

export function blackSpans(log: string) {
  const spans: { start: number; end: number; duration: number }[] = [];
  const marks = /black_start:\s*([0-9.]+)\s+black_end:\s*([0-9.]+)\s+black_duration:\s*([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = marks.exec(log))) {
    spans.push({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) });
  }
  return spans;
}

export function freezeSpans(log: string, fileDuration = 0) {
  const spans: { start: number; end: number; duration: number }[] = [];
  let open: number | null = null;
  const lines = log.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const started = /freeze_start:\s*([0-9.]+)/.exec(line);
    const ended = /freeze_end:\s*([0-9.]+)/.exec(line);
    const lasted = /freeze_duration:\s*([0-9.]+)/.exec(line);
    if (started) open = Number(started[1]);
    if (lasted && open !== null) {
      const duration = Number(lasted[1]);
      spans.push({ start: open, end: ended ? Number(ended[1]) : open + duration, duration });
      open = null;
    } else if (ended && open !== null) {
      const end = Number(ended[1]);
      spans.push({ start: open, end, duration: Math.max(0, end - open) });
      open = null;
    }
  }
  if (open !== null && fileDuration > open) spans.push({ start: open, end: fileDuration, duration: fileDuration - open });
  return spans;
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
    return { ok: false, issues: ["Could not read the rendered file."], duration: 0, black: [] as { start: number; end: number; duration: number }[], freeze: [] as { start: number; end: number; duration: number }[] };
  }
  if (!hasVideo || width < 2 || height < 2) issues.push("No video.");
  if (!(duration > 0.8)) issues.push("Too short to play.");
  if (expect.sourceDuration >= MIN_REEL && duration > MAX_REEL + 1.5) issues.push("Longer than a Reel.");
  if (expect.sourceDuration > LONG_SOURCE && duration > expect.sourceDuration * 0.9 + 0.15) issues.push("Edit matches the source.");
  if (expect.sourceDuration >= 10 && duration < 4) issues.push("Edit came out too short.");
  let black: { start: number; end: number; duration: number }[] = [];
  let freeze: { start: number; end: number; duration: number }[] = [];
  try {
    const log = await run("ffmpeg", ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.12:pix_th=0.10:pic_th=0.98,freezedetect=n=0.003:d=0.8", "-an", "-f", "null", "-"]);
    black = blackSpans(log).filter((span) => span.duration >= 0.12 - 0.01);
    freeze = freezeSpans(log, duration).filter((span) => span.duration >= 0.8 - 0.02);
  } catch {
    issues.push("Could not check the picture.");
  }
  if (black.length) issues.push("Black segment in the picture.");
  if (freeze.length) issues.push("Frozen stretch in the picture.");
  const frames = await sampleLuma(file, duration);
  if (frames.length >= 2 && frames.every((frame) => frame.mean < 14)) issues.push("Picture is black.");
  if (expect.audio) {
    if (!hasAudio) issues.push("Missing audio.");
    else {
      const mean = await meanVolume(file);
      if (mean === null || mean < -50) issues.push("Audio is too quiet.");
      if (mean !== null && mean > -2) issues.push("Audio is distorted.");
    }
  }
  return { ok: issues.length === 0, issues, duration, black, freeze };
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
