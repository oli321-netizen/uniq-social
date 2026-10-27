import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { evenWords, type WordStamp } from "@/lib/edit-timeline";

const execFileAsync = promisify(execFile);
const WHISPER_LIMIT = 24 * 1024 * 1024;

export type Transcript = { text: string; words: WordStamp[]; stub: boolean };

export async function transcribeFile(videoPath: string, durationSec: number): Promise<Transcript> {
  const key = process.env.OPENAI_API_KEY;
  if (!(await hasAudio(videoPath))) {
    throw new Error("This video has no usable audio to transcribe.");
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "hook-audio-"));
  try {
    const audio = path.join(dir, "speech.mp3");
    await run("ffmpeg", ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audio]);
    const info = await stat(audio).catch(() => null);
    if (!info || info.size < 400) {
      throw new Error("This video has no usable audio to transcribe.");
    }
    if (!key) {
      if (process.env.HOOK_LAB_STUB === "1") {
        const script = process.env.HOOK_LAB_STUB_TEXT || "";
        if (script.trim().length < 8) {
          throw new Error("Local stub is on, but HOOK_LAB_STUB_TEXT is empty. Hook Lab will not invent a transcript.");
        }
        const words = evenWords(script, durationSec || (await mediaDuration(audio)));
        return { text: words.map((word) => word.word).join(" "), words, stub: true };
      }
      throw new Error("OPENAI_API_KEY is not set. Hook Lab needs it to transcribe the video and will not invent a transcript.");
    }
    const pieces = info.size > WHISPER_LIMIT ? await splitAudio(dir, audio) : [audio];
    let offset = 0;
    const words: WordStamp[] = [];
    const texts: string[] = [];
    for (const piece of pieces) {
      const part = await whisper(key, piece);
      texts.push(part.text);
      for (const word of part.words) {
        words.push({ word: word.word, start: word.start + offset, end: word.end + offset });
      }
      offset += await mediaDuration(piece);
    }
    const text = texts.join(" ").replace(/\s+/g, " ").trim();
    if (!text) throw new Error("Whisper returned an empty transcript. The clip may have no speech.");
    return { text, words: words.length ? words : evenWords(text, durationSec || offset), stub: false };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function splitAudio(dir: string, audio: string) {
  const pattern = path.join(dir, "part-%03d.mp3");
  await run("ffmpeg", ["-y", "-i", audio, "-f", "segment", "-segment_time", "480", "-c", "copy", pattern]);
  const { readdir } = await import("fs/promises");
  const names = (await readdir(dir)).filter((name) => name.startsWith("part-")).sort();
  const files = names.map((name) => path.join(dir, name));
  for (const file of files) {
    const info = await stat(file);
    if (info.size > WHISPER_LIMIT) {
      throw new Error("A piece of the audio is still over the 25MB transcription limit. Use a shorter clip.");
    }
  }
  if (files.length === 0) throw new Error("Could not split the audio.");
  return files;
}

async function whisper(key: string, filePath: string): Promise<{ text: string; words: WordStamp[] }> {
  const bytes = await readFile(filePath);
  const { body, contentType } = multipart([
    { name: "file", filename: "speech.mp3", contentType: "audio/mpeg", data: bytes },
    { name: "model", value: "whisper-1" },
    { name: "response_format", value: "verbose_json" },
    { name: "timestamp_granularities[]", value: "word" },
  ]);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Whisper failed (${res.status}). ${raw.slice(0, 240)}`);
  }
  const data = JSON.parse(raw) as { text?: string; words?: { word?: string; start?: number; end?: number }[] };
  const words = (data.words || [])
    .map((word) => ({
      word: String(word.word || "").trim(),
      start: Number(word.start),
      end: Number(word.end),
    }))
    .filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start);
  return { text: String(data.text || "").trim(), words };
}

function multipart(parts: { name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }[]) {
  const boundary = `----hook${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType || "application/octet-stream"}\r\n\r\n`
        )
      );
      chunks.push(part.data || Buffer.alloc(0));
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value || ""}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function mediaDuration(filePath: string) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number(String(stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the video length.");
  return duration;
}

export async function hasAudio(filePath: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", filePath]);
  return String(stdout).trim().length > 0;
}

async function run(command: string, args: string[]) {
  try {
    return await execFileAsync(command, args, { timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: string }).stderr || "") : "";
    const message = stderr.trim().split("\n").slice(-3).join(" ") || (error instanceof Error ? error.message : "ffmpeg failed");
    throw new Error(message.slice(0, 400));
  }
}
