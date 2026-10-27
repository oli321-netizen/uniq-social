export type Segment = { id: string; start: number; end: number; speed?: number };
export type WordStamp = { word: string; start: number; end: number };
export type TimedWord = WordStamp & { composedStart: number; composedEnd: number };
export type SourceRange = { start: number; end: number };

const MIN = 0.12;
const MAX_SEGMENTS = 80;

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `seg-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function clampSpeed(speed: unknown) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.5, Math.min(2, Math.round(value * 100) / 100));
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
  const span = Math.max(0, duration);
  const out: Segment[] = [];
  for (const seg of raw) {
    const start = Math.max(0, Math.min(span, Number(seg.start)));
    const end = Math.max(0, Math.min(span, Number(seg.end)));
    if (!(end - start >= MIN)) continue;
    const id = String(seg.id || "").slice(0, 80) || newId();
    out.push({ id, start: round(start), end: round(end), speed: clampSpeed(seg.speed) });
    if (out.length >= MAX_SEGMENTS) break;
  }
  if (out.length === 0 && fallback && span >= MIN) out.push({ id: newId(), start: 0, end: round(span), speed: 1 });
  return out;
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
    { id: newId(), start: round(pos.source), end: seg.end, speed: clampSpeed(seg.speed) }
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
      if (overlapEnd - overlapStart < 0.02) {
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

function normalize(word: string) {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
