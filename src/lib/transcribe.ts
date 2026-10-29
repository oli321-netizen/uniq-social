import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { evenWords, type WordStamp } from "@/lib/edit-timeline";

const execFileAsync = promisify(execFile);
const WHISPER_LIMIT = 24 * 1024 * 1024;
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export type Transcript = { text: string; words: WordStamp[]; stub: boolean };

export type WhisperRequest = {
  url: string;
  contentType: string;
  body: Buffer;
};

export type WhisperTransport = (request: WhisperRequest) => Promise<{ ok: boolean; status: number; body: string }>;

export async function transcribeFile(videoPath: string, durationSec: number, transport?: WhisperTransport, language?: string): Promise<Transcript> {
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
    const key = process.env.OPENAI_API_KEY || "";
    const localStub = !transport && !key && process.env.HOOK_LAB_STUB === "1";
    if (!key && !localStub && !transport) {
      throw new Error("OPENAI_API_KEY is not set. Editor Lab needs it to transcribe the video and will not invent a transcript.");
    }
    const send = transport || (key ? liveTransport(key) : stubTransport);
    const pieces = info.size > WHISPER_LIMIT ? await splitAudio(dir, audio) : [audio];
    let offset = 0;
    const words: WordStamp[] = [];
    const texts: string[] = [];
    for (const piece of pieces) {
      const part = await whisper(piece, send, language);
      texts.push(part.text);
      for (const word of part.words) {
        words.push({ word: word.word, start: word.start + offset, end: word.end + offset });
      }
      offset += await mediaDuration(piece);
    }
    const text = texts.join(" ").replace(/\s+/g, " ").trim();
    if (!text) throw new Error("Whisper returned an empty transcript. The clip may have no speech.");
    return { text, words: words.length ? words : evenWords(text, durationSec || offset), stub: localStub };
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

function liveTransport(key: string): WhisperTransport {
  return async (request) => {
    const res = await fetch(request.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": request.contentType },
      body: request.body as unknown as BodyInit,
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  };
}

async function stubTransport(request: WhisperRequest) {
  assertWhisperRequest(request);
  const script = process.env.HOOK_LAB_STUB_TEXT || "";
  if (script.trim().length < 8) {
    throw new Error("Local stub is on, but HOOK_LAB_STUB_TEXT is empty. Editor Lab will not invent a transcript.");
  }
  const audio = extractAudio(request);
  const dir = await mkdtemp(path.join(os.tmpdir(), "hook-stub-"));
  try {
    const filePath = path.join(dir, "speech.mp3");
    await writeFile(filePath, audio);
    const words = evenWords(script, await mediaDuration(filePath));
    return {
      ok: true,
      status: 200,
      body: JSON.stringify({ text: words.map((word) => word.word).join(" "), words }),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function formatWhisperError(status: number, body: string) {
  let detail = body.replace(/\s+/g, " ").trim().slice(0, 400);
  try {
    const data = JSON.parse(body) as { error?: { message?: string } };
    if (data?.error?.message) detail = String(data.error.message).replace(/\s+/g, " ").trim().slice(0, 400);
  } catch {
    /* body is plain text */
  }
  if (status === 401) return `OpenAI 401: invalid API key. ${detail}`;
  if (status === 429) return `OpenAI 429: quota or rate limit exceeded. ${detail}`;
  if (status === 413) return `OpenAI 413: file too large. ${detail}`;
  return `OpenAI ${status}: ${detail || "request failed"}`;
}

async function whisper(filePath: string, send: WhisperTransport, language?: string): Promise<{ text: string; words: WordStamp[] }> {
  const request = await buildWhisperRequest(filePath, language);
  const res = await send(request);
  if (!res.ok) throw new Error(formatWhisperError(res.status, res.body));
  return parseVerboseJson(res.body);
}

async function buildWhisperRequest(filePath: string, language?: string): Promise<WhisperRequest> {
  const bytes = await readFile(filePath);
  const parts: { name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }[] = [
    { name: "file", filename: "speech.mp3", contentType: "audio/mpeg", data: bytes },
    { name: "model", value: "whisper-1" },
    { name: "response_format", value: "verbose_json" },
    { name: "timestamp_granularities[]", value: "word" },
  ];
  const lang = String(language || "").trim().toLowerCase();
  if (lang && lang !== "auto" && /^[a-z]{2}$/.test(lang)) parts.push({ name: "language", value: lang });
  const { body, contentType } = multipart(parts);
  return { url: WHISPER_URL, contentType, body };
}

function assertWhisperRequest(request: WhisperRequest) {
  if (request.url !== WHISPER_URL) {
    throw new Error("Transcription must call https://api.openai.com/v1/audio/transcriptions.");
  }
  const text = Buffer.from(request.body).toString("latin1");
  const required = [
    'filename="speech.mp3"',
    "audio/mpeg",
    'name="model"',
    "whisper-1",
    'name="response_format"',
    "verbose_json",
    'name="timestamp_granularities[]"',
    "\r\nword\r\n",
  ];
  for (const part of required) {
    if (!text.includes(part)) throw new Error(`The Whisper request is missing ${part}.`);
  }
}

function extractAudio(request: WhisperRequest) {
  const body = Buffer.from(request.body);
  const marker = Buffer.from('filename="speech.mp3"');
  const at = body.indexOf(marker);
  const start = at >= 0 ? body.indexOf(Buffer.from("\r\n\r\n"), at) : -1;
  const end = start >= 0 ? body.indexOf(Buffer.from("\r\n--"), start + 4) : -1;
  if (start < 0 || end < 0) throw new Error("The Whisper request is missing the audio file.");
  return body.subarray(start + 4, end);
}

function parseVerboseJson(raw: string): { text: string; words: WordStamp[] } {
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
