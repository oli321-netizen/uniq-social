import { spawn } from "child_process";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { applyPreset, buildAss, type CaptionStyle } from "@/lib/caption-ass";
import { buildCues } from "@/lib/caption-cues";
import type { WordStamp } from "@/lib/edit-timeline";
import type { VariantPlan } from "@/lib/ai-editor/types";

type Range = { start: number; end: number; zoom: boolean };

export async function renderVariant(input: {
  videoPath: string;
  musicPath?: string;
  outputPath: string;
  words: WordStamp[];
  plan: VariantPlan;
  duration: number;
}) {
  const source = await probeVideo(input.videoPath);
  const original = await hasAudio(input.videoPath);
  const silences = input.plan.silence ? await detectSilences(input.videoPath, -32, 0.45) : [];
  const keeps = markZoom(expand(input.plan, silences, input.duration), input.plan);
  const speed = input.plan.speed;
  const size = { width: 1080, height: 1920 };
  const words = remapWords(input.words, keeps, speed);
  const composed = keeps.reduce((sum, range) => sum + (range.end - range.start) / speed, 0);
  let assPath = "";
  if (input.plan.captions && words.length) {
    const cues = buildCues(words, [{ id: "all", start: 0, end: Math.max(0.4, composed), speed: 1 }]);
    assPath = input.outputPath.replace(/\.mp4$/i, ".ass");
    await writeFile(assPath, buildAss(cues, captionStyle(input.plan), size));
  }
  const useMusic = Boolean(input.musicPath);
  const filter = filterGraph(keeps, speed, size, input.plan, composed, original, useMusic, assPath);
  const args = ["-y", "-i", input.videoPath];
  if (useMusic && input.musicPath) args.push("-stream_loop", "-1", "-i", input.musicPath);
  args.push("-filter_complex", filter, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", input.outputPath);
  try {
    await runFfmpeg(args);
  } finally {
    if (assPath) await rm(assPath, { force: true }).catch(() => {});
  }
  return { keeps: keeps.length, width: size.width, height: size.height, captions: Boolean(assPath), seconds: composed, source };
}

function expand(plan: VariantPlan, silences: { start: number; end: number }[], duration: number): Range[] {
  const ranges: Range[] = [];
  const segments = plan.segments.length ? plan.segments : [{ start: 0, end: duration }];
  for (const segment of segments) {
    const start = clamp(segment.start, 0, Math.max(0, duration - 0.4), 0);
    const end = clamp(segment.end, start + 0.4, duration, duration);
    if (plan.silence) ranges.push(...invert(start, end, silences));
    else ranges.push({ start, end, zoom: false });
  }
  return ranges.length ? ranges : [{ start: 0, end: Math.max(0.4, duration), zoom: false }];
}

function markZoom(ranges: Range[], plan: VariantPlan) {
  if (!plan.zoom || !ranges.length) return ranges;
  const target = plan.silence ? ranges[Math.min(ranges.length - 1, 1)] : ranges[ranges.length - 1];
  return ranges.map((range) => ({ ...range, zoom: range === target }));
}

function captionStyle(plan: VariantPlan): CaptionStyle {
  const id = plan.captionStyle === "karaoke" ? "karaoke" : plan.captionStyle === "minimal" ? "minimal" : "outline";
  const style = applyPreset(id);
  style.position = plan.captionPosition;
  style.size = plan.fontSize;
  if (plan.captionStyle === "bold") {
    style.color = "#FFFFFF";
    style.stroke = "#000000";
    style.strokeWidth = 6;
  }
  if (plan.captionStyle === "karaoke") style.highlight = "#7c5cff";
  return style;
}

function filterGraph(keeps: Range[], speed: number, size: { width: number; height: number }, plan: VariantPlan, composed: number, original: boolean, music: boolean, assPath: string) {
  const parts: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  const rate = speed.toFixed(3);
  keeps.forEach((range, index) => {
    const start = range.start.toFixed(3);
    const end = range.end.toFixed(3);
    const frame = range.zoom ? zoomChain(size, plan.zoomScale) : fitChain(size);
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${rate},${frame}[v${index}]`);
    videos.push(`[v${index}]`);
    if (original && plan.keepOriginal) {
      const tempo = Math.abs(speed - 1) > 0.001 ? `,atempo=${rate}` : "";
      parts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${tempo},aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`);
      audios.push(`[a${index}]`);
    }
  });
  parts.push(`${videos.join("")}concat=n=${keeps.length}:v=1:a=0[vc]`);
  if (assPath) {
    const fonts = path.join(process.cwd(), "public", "fonts");
    parts.push(`[vc]subtitles=${escapeFilter(assPath)}:fontsdir=${escapeFilter(fonts)}[vout]`);
  } else {
    parts.push("[vc]format=yuv420p[vout]");
  }
  const speech = original && plan.keepOriginal;
  if (speech) parts.push(`${audios.join("")}concat=n=${keeps.length}:v=0:a=1[sp]`);
  const length = Math.max(0.4, composed).toFixed(3);
  if (music) {
    const fade = plan.fade ? `,afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, composed - 0.45).toFixed(3)}:d=0.4` : "";
    const offset = Math.max(0, plan.musicOffset).toFixed(3);
    parts.push(`[1:a]atrim=start=${offset}:duration=${length},asetpts=PTS-STARTPTS,volume=${plan.musicVolume.toFixed(3)}${fade},aformat=sample_rates=48000:channel_layouts=stereo[m]`);
    if (speech && plan.duck) {
      parts.push(`[m][sp]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=280:makeup=1.5[md]`);
      parts.push(`[md][sp]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
    } else if (speech) {
      parts.push(`[m][sp]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
    } else {
      parts.push(`[m]atrim=0:${length}[aout]`);
    }
  } else if (speech) {
    parts.push("[sp]aformat=sample_rates=48000:channel_layouts=stereo[aout]");
  } else {
    parts.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${length}[aout]`);
  }
  return parts.join(";");
}

function fitChain(size: { width: number; height: number }) {
  return `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},setsar=1,fps=30,format=yuv420p`;
}

function zoomChain(size: { width: number; height: number }, scale: number) {
  const grownW = even(size.width * scale);
  const grownH = even(size.height * scale);
  return `scale=${grownW}:${grownH}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},setsar=1,fps=30,format=yuv420p`;
}

function invert(start: number, end: number, silences: { start: number; end: number }[]): Range[] {
  const keeps: Range[] = [];
  let cursor = start;
  for (const silence of silences) {
    const cut = Math.min(end, Math.max(silence.start, start));
    const resume = Math.min(end, Math.max(silence.end, start));
    if (cut - cursor >= 0.2) keeps.push({ start: cursor, end: cut, zoom: false });
    cursor = Math.max(cursor, resume);
    if (cursor >= end) break;
  }
  if (end - cursor >= 0.2) keeps.push({ start: cursor, end, zoom: false });
  if (!keeps.length) keeps.push({ start, end: Math.max(start + 0.4, end), zoom: false });
  return keeps;
}

function remapWords(words: WordStamp[], keeps: Range[], speed: number): WordStamp[] {
  const mapped: WordStamp[] = [];
  let cursor = 0;
  for (const keep of keeps) {
    const span = keep.end - keep.start;
    for (const word of words) {
      const mid = (word.start + word.end) / 2;
      if (mid < keep.start || mid >= keep.end) continue;
      const start = cursor + Math.max(0, word.start - keep.start) / speed;
      const end = cursor + Math.min(span, word.end - keep.start) / speed;
      if (end - start > 0.04) mapped.push({ word: word.word, start, end });
    }
    cursor += span / speed;
  }
  return mapped;
}

async function detectSilences(file: string, noiseDb: number, minSec: number) {
  const stderr = await runCollect(["-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSec.toFixed(2)}`, "-f", "null", "-"]);
  const ranges: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const opened = /silence_start:\s*([0-9.]+)/.exec(line);
    if (opened) start = Number(opened[1]);
    const closed = /silence_end:\s*([0-9.]+)/.exec(line);
    if (closed && start !== null) {
      ranges.push({ start, end: Number(closed[1]) });
      start = null;
    }
  }
  return ranges;
}

async function probeVideo(file: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file]);
  const [width, height] = String(stdout).trim().split("x").map(Number);
  if (!width || !height) throw new Error("Could not read that video.");
  return { width, height };
}

async function hasAudio(file: string) {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
    return stdout.includes("audio");
  } catch {
    return false;
  }
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function escapeFilter(filePath: string) {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Render timed out."));
    }, 180000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").slice(-4).join(" ").slice(0, 300) || `ffmpeg exited ${code}`));
    });
  });
}

function runCollect(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.trim().split("\n").slice(-3).join(" ").slice(0, 240)));
    });
  });
}

function exec(command: string, args: string[]) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
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
      if (code === 0) resolve({ stdout });
      else reject(new Error(stderr.trim().slice(0, 240) || `${command} failed`));
    });
  });
}
