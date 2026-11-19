import { createWriteStream } from "fs";
import { stat } from "fs/promises";
import { spawn } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const MAX_MUSIC = 20 * 1024 * 1024;
const BLOCKED = [/youtube\.com/i, /youtu\.be/i, /spotify\.com/i, /music\.youtube/i, /soundcloud\.com/i, /tiktok\.com/i];

export type Track = { id: string; name: string; artist: string; url: string };

export async function searchTracks(query: string): Promise<{ tracks: Track[]; notice: string }> {
  const clientId = process.env.JAMENDO_CLIENT_ID || "";
  const q = query.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q) return { tracks: [], notice: "" };
  if (!clientId) return { tracks: [], notice: "Music search isn't set up yet. Upload your own audio instead." };
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(clientId)}&format=json&limit=8&search=${encodeURIComponent(q)}&include=musicinfo&audioformat=mp31`;
  const res = await fetch(url);
  if (!res.ok) return { tracks: [], notice: "Music search isn't set up yet. Upload your own audio instead." };
  const body = (await res.json()) as { results?: { id?: number; name?: string; artist_name?: string; audio?: string }[] };
  const tracks = (body.results || [])
    .map((track) => ({
      id: String(track.id || ""),
      name: String(track.name || "Track").slice(0, 80),
      artist: String(track.artist_name || "").slice(0, 80),
      url: String(track.audio || ""),
    }))
    .filter((track) => track.url.startsWith("https://"));
  return { tracks, notice: tracks.length ? "" : "No free tracks matched that name." };
}

export async function downloadAudio(source: string, dest: string) {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("That link isn't a direct audio file.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("That link isn't a direct audio file.");
  if (BLOCKED.some((pattern) => pattern.test(url.hostname))) throw new Error("That link isn't a direct audio file. Upload the track instead.");
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error("Couldn't download that audio.");
  const type = res.headers.get("content-type") || "";
  const pathName = url.pathname.toLowerCase();
  const looksAudio = /audio|video|octet-stream|mpeg|mp4/.test(type) || /\.(mp3|wav|m4a|aac|ogg|mp4|webm)$/.test(pathName);
  if (!looksAudio) throw new Error("That link isn't a direct audio file.");
  const length = Number(res.headers.get("content-length") || 0);
  if (length > MAX_MUSIC) throw new Error("Music files can be up to 20MB.");
  await pipeline(limitStream(res.body, MAX_MUSIC), createWriteStream(dest));
  const info = await stat(dest);
  if (info.size < 1000) throw new Error("That audio file was empty.");
}

export async function detectBeats(file: string) {
  const rate = 22050;
  const samples = await pcm(file, rate);
  const window = Math.floor(rate * 0.05);
  const energies: number[] = [];
  for (let index = 0; index + window < samples.length; index += window) {
    let sum = 0;
    for (let sample = index; sample < index + window; sample += 1) sum += samples[sample] * samples[sample];
    energies.push(sum / window);
  }
  const sorted = energies.slice().sort((a, b) => a - b);
  const gate = sorted[Math.floor(sorted.length * 0.82)] || 0;
  const beats: number[] = [];
  for (let index = 1; index < energies.length - 1; index += 1) {
    if (energies[index] < gate) continue;
    if (energies[index] < energies[index - 1] || energies[index] < energies[index + 1]) continue;
    const time = (index * window) / rate;
    if (beats.length && time - beats[beats.length - 1] < 0.28) continue;
    beats.push(Math.round(time * 100) / 100);
    if (beats.length >= 120) break;
  }
  return beats;
}

function limitStream(source: ReadableStream<Uint8Array>, max: number) {
  let seen = 0;
  const reader = source.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      seen += value.byteLength;
      if (seen > max) {
        this.destroy(new Error("Music files can be up to 20MB."));
        return;
      }
      this.push(Buffer.from(value));
    },
  });
}

function pcm(file: string, rate: number) {
  return new Promise<Float32Array>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-t", "45", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Couldn't read that audio."));
        return;
      }
      const buffer = Buffer.concat(chunks);
      resolve(new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4)));
    });
  });
}
