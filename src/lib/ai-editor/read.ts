import { spawn } from "child_process";
import { mkdir, readdir, readFile, rm } from "fs/promises";
import path from "path";
import type { WordStamp } from "@/lib/edit-timeline";
import { clampKind, plainKind } from "@/lib/ai-editor/plan";
import { EDITOR_GUIDANCE, visionModels } from "@/lib/ai-editor/verify";
import type { ContentKind, ReadResult, Shot } from "@/lib/ai-editor/types";
import { transcribeFile } from "@/lib/transcribe";

export async function readClip(videoPath: string, duration: number, workDir: string): Promise<ReadResult> {
  const framesDir = path.join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });
  try {
    const cuts = await sceneCuts(videoPath);
    const sceneShots = shotsFromCuts(cuts, duration);
    const loud = await loudEnough(videoPath);
    let words: WordStamp[] = [];
    let transcript = "";
    if (loud) {
      try {
        const spoken = await transcribeFile(videoPath, duration);
        words = spoken.words;
        transcript = spoken.text;
      } catch {
        words = [];
        transcript = "";
      }
    }
    const speech = words.length >= 6 && transcript.trim().length > 12;
    let kind = localKind(sceneShots, duration, speech);
    let summary = plainKind(kind);
    let shots = kind === "talking" ? sentenceShots(words, duration) : sceneShots.map((shot) => ({ ...shot, continuous: kind !== "montage" && kind !== "b-roll" }));
    const key = process.env.OPENAI_API_KEY || "";
    try {
      const frames = await sampleFrames(videoPath, framesDir);
      if (key && frames.length) {
        const vision = await askVision(key, frames, sceneShots, transcript, duration);
        kind = vision.kind;
        summary = vision.summary || plainKind(kind);
        shots = kind === "talking" && speech ? sentenceShots(words, duration) : labelScenes(sceneShots, vision.shots, kind);
      }
    } catch {
      /* the picture cuts and any speech still drive the edit */
    }
    if (!shots.length) shots = [{ start: 0, end: duration, summary, quality: 0.6, continuous: true }];
    return { kind, summary, shots, speech, words, transcript, duration };
  } finally {
    await rm(framesDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function sceneCuts(file: string) {
  const stderr = await collect(["-i", file, "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"]);
  const cuts: number[] = [];
  const marks = /pts_time:([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = marks.exec(stderr))) {
    const time = Number(match[1]);
    if (Number.isFinite(time)) cuts.push(time);
  }
  return cuts;
}

export function shotsFromCuts(cuts: number[], duration: number): Shot[] {
  const points = [0, ...cuts.filter((time) => time > 0.25 && time < duration - 0.25), duration];
  const unique = points.filter((time, index) => index === 0 || time - points[index - 1] > 0.05);
  const raw: Shot[] = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    raw.push({
      start: round2(unique[index]),
      end: round2(unique[index + 1]),
      summary: `Shot ${index + 1}`,
      quality: 0.55,
      continuous: true,
    });
  }
  const merged: Shot[] = [];
  for (const shot of raw) {
    const prev = merged[merged.length - 1];
    if (prev && shot.end - shot.start < 0.45) {
      prev.end = shot.end;
      continue;
    }
    if (shot.end - shot.start >= 0.35) merged.push(shot);
  }
  if (!merged.length) merged.push({ start: 0, end: round2(duration), summary: "The whole clip", quality: 0.6, continuous: true });
  if (merged.length > 1) merged[merged.length - 1].quality = 0.85;
  merged[0].quality = Math.max(merged[0].quality, 0.7);
  return merged;
}

export function sentenceShots(words: WordStamp[], duration: number): Shot[] {
  const groups: WordStamp[][] = [];
  let bucket: WordStamp[] = [];
  const flush = () => {
    if (bucket.length) groups.push(bucket);
    bucket = [];
  };
  for (const word of words) {
    bucket.push(word);
    if (/[.!?]["']?$/.test(word.word)) flush();
  }
  flush();
  const shots = groups
    .map((group) => ({
      start: round2(Math.max(0, group[0].start - 0.04)),
      end: round2(Math.min(duration, group[group.length - 1].end + 0.1)),
      summary: group.map((word) => word.word).join(" ").replace(/\s+/g, " ").slice(0, 80),
      quality: Math.min(1, 0.4 + group.length / 12),
      continuous: false,
    }))
    .filter((shot) => shot.end - shot.start >= 0.4);
  return shots.length ? shots : [{ start: 0, end: round2(duration), summary: "The whole clip", quality: 0.6, continuous: false }];
}

function localKind(shots: Shot[], duration: number, speech: boolean): ContentKind {
  const average = shots.length ? duration / shots.length : duration;
  if (speech) return "talking";
  if (shots.length >= 4 && average < 3) return "montage";
  return "process";
}

function labelScenes(scenes: Shot[], vision: Shot[], kind: ContentKind): Shot[] {
  const process = kind === "process" || kind === "before-after" || kind === "food" || kind === "gym";
  return scenes.map((scene) => {
    const match = vision.find((shot) => shot.end > scene.start + 0.05 && shot.start < scene.end - 0.05);
    return {
      ...scene,
      continuous: process || scene.continuous,
      summary: match?.summary || scene.summary,
      quality: match ? clamp(match.quality, 0, 1, scene.quality) : scene.quality,
    };
  });
}

async function askVision(key: string, frames: string[], scenes: Shot[], transcript: string, duration: number) {
  const content: { type: string; text?: string; image_url?: { url: string } }[] = [
    {
      type: "text",
      text: `Duration ${duration.toFixed(2)}s. Scene changes at ${scenes.map((shot) => shot.start.toFixed(2)).join(", ") || "none"}. Speech: ${transcript.slice(0, 2500) || "none"}. Frames are in time order, about one every 1 to 2 seconds. Return JSON {kind, summary, shots:[{start,end,summary,quality,continuous}]}. kind is one of talking, process, before-after, montage, product, gym, food, b-roll, other. Mark a haircut, tattoo, workout rep, or cooking step continuous true. quality is 0 to 1. Use the scene times. Do not invent a cut in the middle of a continuous action.\n\nHow a good editor would cut:\n${EDITOR_GUIDANCE}`,
    },
  ];
  for (const frame of frames.slice(0, 8)) {
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame}` } });
  }
  let lastStatus = 0;
  let parsed: { kind?: unknown; summary?: unknown; shots?: unknown[] } | null = null;
  for (const model of visionModels()) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You read a video from still frames, scene times, and any transcript. Reply with one JSON object only. Follow the editing examples." },
          { role: "user", content },
        ],
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      parsed = JSON.parse(String(body.choices?.[0]?.message?.content || "{}")) as { kind?: unknown; summary?: unknown; shots?: unknown[] };
      break;
    }
    lastStatus = res.status;
    const detail = await res.text();
    const missing = res.status === 404 || /model/i.test(detail);
    if (!missing || model === "gpt-4o-mini") break;
  }
  if (!parsed) throw new Error(`Vision ${lastStatus || "failed"}`);
  const shots: Shot[] = [];
  if (Array.isArray(parsed.shots)) {
    for (const item of parsed.shots) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const start = Number(record.start);
      const end = Number(record.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      shots.push({
        start: clamp(start, 0, duration, 0),
        end: clamp(end, 0, duration, duration),
        summary: String(record.summary || "").replace(/\s+/g, " ").trim().slice(0, 80),
        quality: clamp(Number(record.quality), 0, 1, 0.5),
        continuous: record.continuous === true,
      });
    }
  }
  return { kind: clampKind(parsed.kind), summary: String(parsed.summary || "").replace(/\s+/g, " ").trim().slice(0, 140), shots };
}

export async function sampleFrames(file: string, dir: string) {
  await run(["-y", "-i", file, "-vf", "fps=1/1.5,scale=320:-2", "-frames:v", "8", "-q:v", "8", path.join(dir, "f%02d.jpg")]);
  const names = (await readdir(dir)).filter((name) => name.endsWith(".jpg")).sort();
  const frames: string[] = [];
  for (const name of names) frames.push((await readFile(path.join(dir, name))).toString("base64"));
  return frames;
}

async function loudEnough(file: string) {
  const listed = await audioProbe(file);
  if (!/codec_type=audio/.test(listed)) return false;
  try {
    const probe = await collect(["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
    const mean = /mean_volume:\s*(-?[0-9.]+)\s*dB/.exec(probe);
    if (!mean) return false;
    return Number(mean[1]) > -48;
  } catch {
    return false;
  }
}

function audioProbe(file: string) {
  return new Promise<string>((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "default=nw=1", file], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("close", () => resolve(stdout));
    child.on("error", () => resolve(""));
  });
}

function collect(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.trim().split("\n").slice(-2).join(" ").slice(0, 240)));
    });
  });
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.slice(-200)))));
  });
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
