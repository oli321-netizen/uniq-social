export type SegmentFilter = "none" | "vivid" | "warm" | "cool" | "bw" | "fade";
export type SegmentEffect = "none" | "punch" | "shake" | "blur";
export type SegmentTransition = "none" | "fade" | "slide";
export type SegmentKey = { t: number; x: number; y: number; scale: number };
export type Segment = {
  id: string;
  start: number;
  end: number;
  speed?: number;
  kind?: "video" | "image";
  assetId?: string;
  mediaDuration?: number;
  reverse?: boolean;
  freeze?: boolean;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  flipX?: boolean;
  flipY?: boolean;
  crop?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  filter?: SegmentFilter;
  effect?: SegmentEffect;
  transition?: SegmentTransition;
  keyframes?: SegmentKey[];
};
export type WordStamp = { word: string; start: number; end: number };
export type TimedWord = WordStamp & { composedStart: number; composedEnd: number };
export type SourceRange = { start: number; end: number };

const FILTERS: SegmentFilter[] = ["none", "vivid", "warm", "cool", "bw", "fade"];
const EFFECTS: SegmentEffect[] = ["none", "punch", "shake", "blur"];
const TRANSITIONS: SegmentTransition[] = ["none", "fade", "slide"];

const MIN = 0.12;
const MAX_SEGMENTS = 80;

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `seg-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function clampSpeed(speed: unknown) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.25, Math.min(4, Math.round(value * 100) / 100));
}

export function atempoChain(speed: number) {
  let remain = clampSpeed(speed);
  const parts: string[] = [];
  while (remain < 0.5 - 1e-6) {
    parts.push("atempo=0.5");
    remain /= 0.5;
  }
  while (remain > 2 + 1e-6) {
    parts.push("atempo=2");
    remain /= 2;
  }
  const last = Math.max(0.5, Math.min(2, Math.round(remain * 1000) / 1000));
  parts.push(`atempo=${last.toFixed(3)}`);
  return parts.join(",");
}

export function playDuration(seg: Segment) {
  return Math.max(0, seg.end - seg.start) / clampSpeed(seg.speed);
}

export function composedDuration(segments: Segment[]) {
  return segments.reduce((sum, seg) => sum + playDuration(seg), 0);
}

export function composedStart(segments: Segment[], index: number) {
  let cursor = 0;
  for (let i = 0; i < index && i < segments.length; i++) cursor += playDuration(segments[i]);
  return cursor;
}

export function clampSegments(raw: Segment[], duration: number, fallback = true): Segment[] {
  const projectSpan = Math.max(0, duration);
  const out: Segment[] = [];
  for (const seg of raw) {
    const own = Number(seg.mediaDuration);
    const span = Number.isFinite(own) && own > 0 ? Math.min(600, own) : projectSpan;
    const start = Math.max(0, Math.min(span, Number(seg.start)));
    const end = Math.max(0, Math.min(span, Number(seg.end)));
    if (!(end - start >= MIN)) continue;
    const id = String(seg.id || "").slice(0, 80) || newId();
    out.push({ id, start: round(start), end: round(end), speed: clampSpeed(seg.speed), ...sanitizeLook(seg) });
    if (out.length >= MAX_SEGMENTS) break;
  }
  if (out.length === 0 && fallback && projectSpan >= MIN) out.push({ id: newId(), start: 0, end: round(projectSpan), speed: 1 });
  return out;
}

export function segmentIsPlain(seg: Segment) {
  if (seg.assetId || seg.reverse || seg.freeze || seg.flipX || seg.flipY || seg.kind === "image") return false;
  if ((seg.volume ?? 1) !== 1) return false;
  if ((seg.fadeIn || 0) > 0 || (seg.fadeOut || 0) > 0) return false;
  if ((seg.x || 0) !== 0 || (seg.y || 0) !== 0) return false;
  if (Math.abs((seg.scale ?? 1) - 1) > 0.001) return false;
  if ((seg.rotate || 0) !== 0 || (seg.crop || 0) > 0) return false;
  if (Math.abs(seg.brightness || 0) > 0.001) return false;
  if (Math.abs((seg.contrast ?? 1) - 1) > 0.001 || Math.abs((seg.saturation ?? 1) - 1) > 0.001) return false;
  if (Math.abs(seg.temperature || 0) > 0.001) return false;
  if (seg.filter && seg.filter !== "none") return false;
  if (seg.effect && seg.effect !== "none") return false;
  if (seg.transition && seg.transition !== "none") return false;
  if (seg.keyframes && seg.keyframes.length > 0) return false;
  return true;
}

export function splitAt(segments: Segment[], composed: number): Segment[] {
  if (segments.length === 0) return segments;
  const pos = sourceAt(segments, composed);
  const seg = segments[pos.index];
  if (!seg) return segments;
  if (pos.source - seg.start < MIN || seg.end - pos.source < MIN) return segments;
  const next = segments.slice();
  next.splice(
    pos.index,
    1,
    { ...seg, end: round(pos.source) },
    { ...seg, id: newId(), start: round(pos.source), end: seg.end, speed: clampSpeed(seg.speed) }
  );
  return next;
}

export function sourceAt(segments: Segment[], composed: number) {
  let cursor = 0;
  const total = composedDuration(segments);
  const time = Math.max(0, Math.min(total, composed));
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const len = playDuration(seg);
    const speed = clampSpeed(seg.speed);
    if (time <= cursor + len + 0.0001 || i === segments.length - 1) {
      const local = Math.max(0, Math.min(len, time - cursor));
      return { index: i, source: seg.start + local * speed, composed: cursor + local, speed };
    }
    cursor += len;
  }
  return { index: 0, source: segments[0]?.start || 0, composed: 0, speed: 1 };
}

export function mapWords(words: WordStamp[], segments: Segment[]): TimedWord[] {
  const mapped: TimedWord[] = [];
  for (const word of words) {
    const mid = (Number(word.start) + Number(word.end)) / 2;
    let cursor = 0;
    for (const seg of segments) {
      const speed = clampSpeed(seg.speed);
      const len = playDuration(seg);
      if (mid >= seg.start && mid < seg.end) {
        const start = cursor + Math.max(0, (word.start - seg.start) / speed);
        const end = cursor + Math.min(len, (word.end - seg.start) / speed);
        if (end - start > 0.02) {
          mapped.push({
            word: word.word,
            start: word.start,
            end: word.end,
            composedStart: round(start),
            composedEnd: round(Math.max(start + 0.04, end)),
          });
        }
        break;
      }
      cursor += len;
    }
  }
  return mapped;
}

export function parseWords(raw: unknown): WordStamp[] {
  if (!Array.isArray(raw)) return [];
  const words: WordStamp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const word = String((item as { word?: unknown }).word || "").replace(/\s+/g, " ").trim();
    const start = Number((item as { start?: unknown }).start);
    const end = Number((item as { end?: unknown }).end);
    if (!word || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    words.push({ word: word.slice(0, 80), start, end });
    if (words.length >= 8000) break;
  }
  return words;
}

export function evenWords(text: string, duration: number): WordStamp[] {
  const parts = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const span = Math.max(duration, 0.4);
  const weight = parts.reduce((sum, word) => sum + Math.max(1, word.length), 0) || 1;
  let cursor = 0;
  return parts.map((word) => {
    const slice = (span * Math.max(1, word.length)) / weight;
    const start = cursor;
    const end = Math.min(span, cursor + Math.max(0.08, slice));
    cursor = end;
    return { word, start: round(start), end: round(end) };
  });
}

export function reorderSegments(segments: Segment[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= segments.length || to >= segments.length) return segments;
  const next = segments.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function setSegmentSpeed(segments: Segment[], id: string, speed: number) {
  return segments.map((seg) => (seg.id === id ? { ...seg, speed: clampSpeed(speed) } : seg));
}

export function mergeRanges(ranges: SourceRange[]) {
  const sorted = ranges
    .map((range) => ({ start: Math.min(range.start, range.end), end: Math.max(range.start, range.end) }))
    .filter((range) => range.end - range.start > 0.02)
    .sort((a, b) => a.start - b.start);
  const out: SourceRange[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.start <= last.end + 0.02) last.end = Math.max(last.end, range.end);
    else out.push({ start: range.start, end: range.end });
  }
  return out;
}

export function cutSourceRanges(segments: Segment[], ranges: SourceRange[], mediaDuration: number) {
  const cuts = mergeRanges(ranges);
  if (cuts.length === 0) return segments;
  let next: Segment[] = segments.map((seg) => ({ ...seg, speed: clampSpeed(seg.speed) }));
  for (const cut of cuts) {
    const produced: Segment[] = [];
    for (const seg of next) {
      const overlapStart = Math.max(seg.start, cut.start);
      const overlapEnd = Math.min(seg.end, cut.end);
      if (seg.assetId || overlapEnd - overlapStart < 0.02) {
        produced.push(seg);
        continue;
      }
      if (overlapStart - seg.start >= MIN) produced.push({ ...seg, end: round(overlapStart) });
      if (seg.end - overlapEnd >= MIN) produced.push({ ...seg, id: newId(), start: round(overlapEnd) });
    }
    next = produced;
  }
  const clamped = clampSegments(next, mediaDuration, false);
  return clamped.length ? clamped : segments;
}

export function silenceRanges(words: WordStamp[], minGap = 0.35) {
  const sorted = words.slice().sort((a, b) => a.start - b.start);
  const ranges: SourceRange[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i].end + 0.03;
    const end = sorted[i + 1].start - 0.03;
    if (end - start >= minGap) ranges.push({ start, end });
  }
  return ranges;
}

const FILLERS = new Set(["um", "uh", "uhh", "umm", "erm", "hmm", "ah", "eh", "like", "basically", "literally", "anyway"]);

export function fillerIndexes(words: WordStamp[]) {
  const drop = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const current = normalize(words[i].word);
    const next = words[i + 1] ? normalize(words[i + 1].word) : "";
    if (current === "you" && next === "know") {
      drop.add(i);
      drop.add(i + 1);
      i += 1;
      continue;
    }
    if (FILLERS.has(current)) drop.add(i);
  }
  return drop;
}

export function rangesForIndexes(words: WordStamp[], indexes: Set<number>) {
  const ranges: SourceRange[] = [];
  const sorted = Array.from(indexes).sort((a, b) => a - b);
  let cursor = 0;
  while (cursor < sorted.length) {
    let end = cursor;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    const first = words[sorted[cursor]];
    const last = words[sorted[end]];
    if (first && last) ranges.push({ start: first.start, end: last.end });
    cursor = end + 1;
  }
  return ranges;
}

export function sentenceGroups(words: WordStamp[]) {
  const groups: WordStamp[][] = [];
  let current: WordStamp[] = [];
  for (const word of words) {
    current.push(word);
    if (/[.!?]$/.test(word.word) || current.length >= 24) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

export function snapTime(time: number, points: number[], threshold: number) {
  let best = time;
  let bestDist = threshold;
  for (const point of points) {
    const dist = Math.abs(point - time);
    if (dist <= bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function sanitizeLook(seg: Partial<Segment>): Partial<Segment> {
  const look: Partial<Segment> = {};
  if (seg.kind === "image" || seg.kind === "video") look.kind = seg.kind;
  if (typeof seg.assetId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seg.assetId)) {
    look.assetId = seg.assetId;
  }
  const media = Number(seg.mediaDuration);
  if (Number.isFinite(media) && media > 0) look.mediaDuration = Math.min(600, round(media));
  if (seg.reverse) look.reverse = true;
  if (seg.freeze) look.freeze = true;
  if (seg.flipX) look.flipX = true;
  if (seg.flipY) look.flipY = true;
  const volume = Number(seg.volume);
  if (Number.isFinite(volume)) look.volume = Math.max(0, Math.min(1, round(volume)));
  const fadeIn = Number(seg.fadeIn);
  if (Number.isFinite(fadeIn) && fadeIn > 0) look.fadeIn = Math.min(5, round(fadeIn));
  const fadeOut = Number(seg.fadeOut);
  if (Number.isFinite(fadeOut) && fadeOut > 0) look.fadeOut = Math.min(5, round(fadeOut));
  const x = Number(seg.x);
  if (Number.isFinite(x) && x !== 0) look.x = Math.max(-800, Math.min(800, Math.round(x)));
  const y = Number(seg.y);
  if (Number.isFinite(y) && y !== 0) look.y = Math.max(-800, Math.min(800, Math.round(y)));
  const scale = Number(seg.scale);
  if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.001) look.scale = Math.max(0.2, Math.min(3, round(scale)));
  const rotate = Number(seg.rotate);
  if (Number.isFinite(rotate) && rotate !== 0) look.rotate = Math.max(-180, Math.min(180, Math.round(rotate)));
  const crop = Number(seg.crop);
  if (Number.isFinite(crop) && crop > 0) look.crop = Math.max(0, Math.min(0.3, round(crop)));
  const brightness = Number(seg.brightness);
  if (Number.isFinite(brightness) && brightness !== 0) look.brightness = Math.max(-0.3, Math.min(0.3, round(brightness)));
  const contrast = Number(seg.contrast);
  if (Number.isFinite(contrast) && contrast !== 1) look.contrast = Math.max(0.4, Math.min(2, round(contrast)));
  const saturation = Number(seg.saturation);
  if (Number.isFinite(saturation) && saturation !== 1) look.saturation = Math.max(0, Math.min(3, round(saturation)));
  const temperature = Number(seg.temperature);
  if (Number.isFinite(temperature) && temperature !== 0) look.temperature = Math.max(-1, Math.min(1, round(temperature)));
  if (seg.filter && FILTERS.includes(seg.filter) && seg.filter !== "none") look.filter = seg.filter;
  if (seg.effect && EFFECTS.includes(seg.effect) && seg.effect !== "none") look.effect = seg.effect;
  if (seg.transition && TRANSITIONS.includes(seg.transition) && seg.transition !== "none") look.transition = seg.transition;
  if (Array.isArray(seg.keyframes)) {
    const keys: SegmentKey[] = [];
    for (const key of seg.keyframes) {
      if (!key || keys.length >= 2) break;
      const t = Number(key.t);
      const kx = Number(key.x);
      const ky = Number(key.y);
      const ks = Number(key.scale);
      if (!Number.isFinite(t) || !Number.isFinite(kx) || !Number.isFinite(ky) || !Number.isFinite(ks)) continue;
      keys.push({
        t: Math.max(0, Math.min(1, round(t))),
        x: Math.max(-800, Math.min(800, Math.round(kx))),
        y: Math.max(-800, Math.min(800, Math.round(ky))),
        scale: Math.max(0.2, Math.min(3, round(ks))),
      });
    }
    if (keys.length) look.keyframes = keys;
  }
  return look;
}

function normalize(word: string) {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
