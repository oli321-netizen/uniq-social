import { spawn } from "child_process";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { applyPreset, buildAss, type CaptionStyle } from "@/lib/caption-ass";
import { buildCues } from "@/lib/caption-cues";
import type { WordStamp } from "@/lib/edit-timeline";
import type { AiPlan } from "@/lib/ai-editor/plan";

type Range = { start: number; end: number; zoom: boolean };

export async function renderAiVideo(input: { videoPath: string; outputPath: string; words: WordStamp[]; plan: AiPlan; duration: number; window?: { start: number; end: number } }) {
  const source = await probe(input.videoPath);
  const windowStart = input.window ? bound(input.window.start, 0, Math.max(0, input.duration - 0.4)) : input.plan.trimStart;
  const windowEnd = input.window ? bound(input.window.end, windowStart + 0.4, input.duration) : Math.max(input.plan.trimStart + 0.4, input.duration - input.plan.trimEnd);
  if (!(windowEnd - windowStart >= 0.4)) throw new Error("That clip is too short to render.");
  const silences = input.plan.silence ? await detectSilences(input.videoPath, input.plan.silenceDb, input.plan.silenceMin) : [];
  const keeps = input.plan.silence ? invert(windowStart, windowEnd, silences) : [{ start: windowStart, end: windowEnd, zoom: false }];
  const marked = keeps.map((range) => ({
    ...range,
    zoom: input.plan.zoom && input.plan.zoomMoments.some((moment) => moment.end > range.start && moment.start < range.end),
  }));
  const speed = input.plan.tighten ? input.plan.speed : 1;
  const size = input.plan.aspect === "9:16" ? { width: 1080, height: 1920 } : evenSize(source.width, source.height);
  const words = remapWords(input.words, marked, speed);
  const composed = marked.reduce((sum, range) => sum + (range.end - range.start) / speed, 0);
  let assPath = "";
  if (input.plan.captions && words.length) {
    const cues = buildCues(words, [{ id: "all", start: 0, end: Math.max(0.4, composed), speed: 1 }]);
    assPath = input.outputPath.replace(/\.mp4$/i, ".ass");
    await writeFile(assPath, buildAss(cues, captionStyle(input.plan), size));
  }
  const filter = filterGraph(marked, speed, size, input.plan.zoomScale, assPath);
  try {
    await runFfmpeg(["-y", "-i", input.videoPath, "-filter_complex", filter, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", input.outputPath]);
  } finally {
    if (assPath) await rm(assPath, { force: true }).catch(() => {});
  }
  return { keeps: marked.length, width: size.width, height: size.height, captions: Boolean(assPath) };
}

function bound(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function captionStyle(plan: AiPlan): CaptionStyle {
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

function filterGraph(keeps: Range[], speed: number, size: { width: number; height: number }, zoomScale: number, assPath: string) {
  const parts: string[] = [];
  const labels: string[] = [];
  keeps.forEach((range, index) => {
    const start = range.start.toFixed(3);
    const end = range.end.toFixed(3);
    const rate = speed.toFixed(3);
    const frame = range.zoom ? zoomChain(size, zoomScale) : fitChain(size);
    parts.push(`[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${rate},${frame}[v${index}]`);
    const tempo = Math.abs(speed - 1) > 0.001 ? `,atempo=${rate}` : "";
    parts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${tempo},aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`);
    labels.push(`[v${index}][a${index}]`);
  });
  parts.push(`${labels.join("")}concat=n=${keeps.length}:v=1:a=1[vc][aout]`);
  if (assPath) {
    const fonts = path.join(process.cwd(), "public", "fonts");
    parts.push(`[vc]subtitles=${escapeFilter(assPath)}:fontsdir=${escapeFilter(fonts)}[vout]`);
  } else {
    parts.push("[vc]format=yuv420p[vout]");
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
  if (keeps.length === 0) keeps.push({ start, end: Math.max(start + 0.4, end), zoom: false });
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

export async function detectSilences(file: string, noiseDb: number, minSec: number) {
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

async function probe(file: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file]);
  const [width, height] = String(stdout).trim().split("x").map(Number);
  if (!width || !height) throw new Error("Could not read the video size.");
  return { width, height };
}

function evenSize(width: number, height: number) {
  const cap = 1280;
  const scale = Math.min(1, cap / Math.max(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
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
      else reject(new Error((stderr.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${code}`).slice(0, 400)));
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
      else reject(new Error(stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400)));
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
      else reject(new Error(stderr.trim().slice(0, 300) || `${command} failed`));
    });
  });
}
