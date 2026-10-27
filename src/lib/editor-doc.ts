import { clampSpeed, playDuration, segmentIsPlain, type Segment } from "@/lib/edit-timeline";

export type Aspect = "9:16" | "1:1" | "16:9";
export type EditorAsset = {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  duration: number;
  ext: string;
};
export type EditorLayer = {
  id: string;
  assetId: string;
  start: number;
  in: number;
  out: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  x?: number;
  y?: number;
  scale?: number;
};
export type TextLayer = {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  size: number;
  color: string;
  emoji?: boolean;
};
export type EditorDoc = {
  aspect: Aspect;
  fps: 24 | 30 | 60;
  resolution: 720 | 1080;
  background: "blur" | "black";
  assets: EditorAsset[];
  overlays: EditorLayer[];
  audios: EditorLayer[];
  texts: TextLayer[];
  beats: number[];
};

export const DEFAULT_EDITOR: EditorDoc = {
  aspect: "9:16",
  fps: 30,
  resolution: 1080,
  background: "black",
  assets: [],
  overlays: [],
  audios: [],
  texts: [],
  beats: [],
};

export const FILTER_PRESETS = {
  none: { brightness: 0, contrast: 1, saturation: 1, temperature: 0 },
  vivid: { brightness: 0.04, contrast: 1.12, saturation: 1.35, temperature: 0.05 },
  warm: { brightness: 0.03, contrast: 1.05, saturation: 1.1, temperature: 0.55 },
  cool: { brightness: 0, contrast: 1.05, saturation: 1, temperature: -0.55 },
  bw: { brightness: 0, contrast: 1.1, saturation: 0, temperature: 0 },
  fade: { brightness: 0.08, contrast: 0.9, saturation: 0.75, temperature: 0.1 },
} as const;

const ASPECTS: Aspect[] = ["9:16", "1:1", "16:9"];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canvasSize(editor: Pick<EditorDoc, "aspect" | "resolution">) {
  const tall = editor.resolution === 720 ? 720 : 1080;
  if (editor.aspect === "1:1") return { width: tall, height: tall };
  if (editor.aspect === "16:9") return { width: tall === 720 ? 1280 : 1920, height: tall === 720 ? 720 : 1080 };
  return { width: tall, height: tall === 720 ? 1280 : 1920 };
}

export function isPlain(editor: EditorDoc, segments: Segment[]) {
  if (editor.aspect !== "9:16" || editor.fps !== 30 || editor.resolution !== 1080 || editor.background !== "black") return false;
  if (editor.overlays.length || editor.audios.length || editor.texts.length) return false;
  return segments.every(segmentIsPlain);
}

export function cssFilter(seg: Segment) {
  const brightness = 1 + (seg.brightness || 0);
  const contrast = seg.contrast ?? 1;
  const saturation = seg.saturation ?? 1;
  const hue = (seg.temperature || 0) * 18;
  const blur = seg.effect === "blur" ? " blur(2px)" : "";
  if (brightness === 1 && contrast === 1 && saturation === 1 && hue === 0 && !blur) return undefined;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)${blur}`;
}

export function transformAt(seg: Segment, ratio: number) {
  const keys = seg.keyframes;
  if (keys && keys.length >= 2) {
    const a = keys[0];
    const b = keys[1];
    const span = b.t - a.t || 1;
    const u = Math.max(0, Math.min(1, (ratio - a.t) / span));
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      scale: a.scale,
    };
  }
  return { x: seg.x || 0, y: seg.y || 0, scale: seg.scale ?? 1 };
}

export function beatsFromPeaks(peaks: number[], sourceDuration: number, segments: Segment[]) {
  if (peaks.length < 3 || sourceDuration <= 0) return [];
  let max = 0;
  for (const peak of peaks) if (peak > max) max = peak;
  const threshold = Math.max(0.35, max * 0.72);
  const step = sourceDuration / peaks.length;
  const beats: number[] = [];
  for (let i = 1; i < peaks.length - 1; i++) {
    if (peaks[i] < threshold || peaks[i] < peaks[i - 1] || peaks[i] < peaks[i + 1]) continue;
    const source = i * step;
    let cursor = 0;
    for (const seg of segments) {
      if (!seg.assetId && source >= seg.start && source < seg.end) {
        const composed = cursor + (source - seg.start) / clampSpeed(seg.speed);
        if (beats.length === 0 || composed - beats[beats.length - 1] >= 0.35) beats.push(round(composed));
        break;
      }
      cursor += playDuration(seg);
    }
    if (beats.length >= 200) break;
  }
  return beats;
}

export function parseEditor(raw: unknown): EditorDoc {
  const value = raw && typeof raw === "object" ? (raw as Partial<EditorDoc>) : {};
  const aspect = ASPECTS.includes(value.aspect as Aspect) ? (value.aspect as Aspect) : "9:16";
  const fps = value.fps === 24 || value.fps === 60 ? value.fps : 30;
  const resolution = value.resolution === 720 ? 720 : 1080;
  const background = value.background === "blur" ? "blur" : "black";
  return {
    aspect,
    fps,
    resolution,
    background,
    assets: parseAssets(value.assets).slice(0, 16),
    overlays: parseLayers(value.overlays).slice(0, 4),
    audios: parseLayers(value.audios).slice(0, 4),
    texts: parseTexts(value.texts).slice(0, 12),
    beats: parseBeats(value.beats),
  };
}

function parseAssets(raw: unknown): EditorAsset[] {
  if (!Array.isArray(raw)) return [];
  const assets: EditorAsset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<EditorAsset>;
    if (!row.id || !ID.test(row.id)) continue;
    if (row.kind !== "video" && row.kind !== "image" && row.kind !== "audio") continue;
    const ext = String(row.ext || "").toLowerCase();
    if (!/^[a-z0-9]{1,4}$/.test(ext)) continue;
    assets.push({
      id: row.id,
      kind: row.kind,
      name: String(row.name || "Import").slice(0, 80),
      duration: Math.max(0, Math.min(600, Number(row.duration) || 0)),
      ext,
    });
  }
  return assets;
}

function parseLayers(raw: unknown): EditorLayer[] {
  if (!Array.isArray(raw)) return [];
  const layers: EditorLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<EditorLayer>;
    if (!row.id || !row.assetId || !ID.test(row.assetId)) continue;
    const start = Number(row.start);
    const inn = Number(row.in);
    const out = Number(row.out);
    if (!Number.isFinite(start) || !Number.isFinite(inn) || !Number.isFinite(out) || out - inn < 0.12) continue;
    const layer: EditorLayer = {
      id: String(row.id).slice(0, 80),
      assetId: row.assetId,
      start: Math.max(0, round(start)),
      in: Math.max(0, round(inn)),
      out: round(out),
    };
    if (Number.isFinite(Number(row.volume))) layer.volume = Math.max(0, Math.min(1, Number(row.volume)));
    if (Number(row.fadeIn) > 0) layer.fadeIn = Math.min(5, Number(row.fadeIn));
    if (Number(row.fadeOut) > 0) layer.fadeOut = Math.min(5, Number(row.fadeOut));
    if (Number.isFinite(Number(row.x))) layer.x = Math.max(-800, Math.min(800, Math.round(Number(row.x))));
    if (Number.isFinite(Number(row.y))) layer.y = Math.max(-800, Math.min(800, Math.round(Number(row.y))));
    if (Number.isFinite(Number(row.scale))) layer.scale = Math.max(0.15, Math.min(2, Number(row.scale)));
    layers.push(layer);
  }
  return layers;
}

function parseTexts(raw: unknown): TextLayer[] {
  if (!Array.isArray(raw)) return [];
  const texts: TextLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<TextLayer>;
    const text = String(row.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const start = Number(row.start);
    const end = Number(row.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.12) continue;
    texts.push({
      id: String(row.id || "").slice(0, 80) || `text-${texts.length}`,
      text,
      start: Math.max(0, round(start)),
      end: round(end),
      x: Math.max(-800, Math.min(800, Math.round(Number(row.x) || 0))),
      y: Math.max(-800, Math.min(800, Math.round(Number(row.y) || 0))),
      size: Math.max(24, Math.min(240, Math.round(Number(row.size) || 72))),
      color: /^#[0-9a-f]{6}$/i.test(String(row.color || "")) ? String(row.color) : "#ffffff",
      emoji: Boolean(row.emoji),
    });
  }
  return texts;
}

function parseBeats(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const beats: number[] = [];
  for (const item of raw) {
    const value = Number(item);
    if (!Number.isFinite(value) || value < 0) continue;
    beats.push(round(value));
    if (beats.length >= 200) break;
  }
  return beats;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
