import { spawn } from "child_process";
import { access, mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export type Filmstrip = { filePath: string; frames: number; interval: number };
export type Waveform = { peaks: number[]; duration: number };

export async function ensureFilmstrip(videoPath: string, duration: number): Promise<Filmstrip> {
  const strip = sibling(videoPath, "-strip.jpg");
  const metaPath = sibling(videoPath, "-strip.json");
  try {
    await access(strip);
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as Filmstrip;
    if (meta.frames > 0 && meta.interval > 0) return { filePath: strip, frames: meta.frames, interval: meta.interval };
  } catch {
    /* generate */
  }
  const frames = Math.max(6, Math.min(24, Math.round(duration)));
  const dir = await mkdirTemp();
  try {
    await run("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vf",
      `fps=${(frames / Math.max(duration, 0.2)).toFixed(4)},scale=80:142:force_original_aspect_ratio=increase,crop=80:142`,
      path.join(dir, "f%03d.jpg"),
    ]);
    const names = (await readdir(dir)).filter((name) => name.endsWith(".jpg")).sort();
    if (names.length === 0) throw new Error("No filmstrip frames.");
    const count = names.length;
    await run("ffmpeg", ["-y", "-i", path.join(dir, "f%03d.jpg"), "-filter_complex", `tile=${count}x1`, "-frames:v", "1", strip]);
    const meta = { frames: count, interval: duration / count };
    await writeFile(metaPath, JSON.stringify(meta));
    return { filePath: strip, frames: meta.frames, interval: meta.interval };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function ensureWaveform(videoPath: string, duration: number): Promise<Waveform> {
  const dest = sibling(videoPath, "-wave.json");
  try {
    const cached = JSON.parse(await readFile(dest, "utf8")) as Waveform;
    if (Array.isArray(cached.peaks) && cached.peaks.length > 0) return cached;
  } catch {
    /* generate */
  }
  const raw = await runBuffer("ffmpeg", ["-y", "-i", videoPath, "-ac", "1", "-ar", "8000", "-f", "f32le", "-vn", "pipe:1"]);
  const samples = Math.floor(raw.length / 4);
  const copy = Buffer.from(raw.subarray(0, samples * 4));
  const view = new Float32Array(copy.buffer, copy.byteOffset, samples);
  const buckets = Math.max(40, Math.min(800, Math.round(duration * 12)));
  const peaks: number[] = [];
  const size = Math.max(1, Math.floor(view.length / buckets));
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    const start = i * size;
    const end = Math.min(view.length, start + size);
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(view[j] || 0));
    peaks.push(Math.round(peak * 1000) / 1000);
  }
  const waveform = { peaks, duration };
  await writeFile(dest, JSON.stringify(waveform));
  return waveform;
}

function sibling(videoPath: string, suffix: string) {
  const parsed = path.parse(videoPath);
  return path.join(parsed.dir, `${parsed.name}${suffix}`);
}

async function mkdirTemp() {
  const dir = path.join(os.tmpdir(), `hook-strip-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error((stderr.trim().split("\n").slice(-3).join(" ") || `${command} failed`).slice(0, 400)));
    });
  });
}

function runBuffer(command: string, args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error((stderr.trim().split("\n").slice(-3).join(" ") || `${command} failed`).slice(0, 400)));
    });
  });
}
