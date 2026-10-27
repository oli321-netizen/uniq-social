export type Segment = { id: string; start: number; end: number };
export type WordStamp = { word: string; start: number; end: number };
export type TimedWord = WordStamp & { composedStart: number; composedEnd: number };

const MIN = 0.12;

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `seg-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function composedDuration(segments: Segment[]) {
  return segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
}

export function clampSegments(raw: Segment[], duration: number): Segment[] {
  const span = Math.max(0, duration);
  const out: Segment[] = [];
  for (const seg of raw) {
    const start = Math.max(0, Math.min(span, Number(seg.start)));
    const end = Math.max(0, Math.min(span, Number(seg.end)));
    if (!(end - start >= MIN)) continue;
    const id = String(seg.id || "").slice(0, 80) || newId();
    out.push({ id, start, end });
    if (out.length >= 40) break;
  }
  if (out.length === 0 && span >= MIN) out.push({ id: newId(), start: 0, end: span });
  return out;
}

export function splitAt(segments: Segment[], composed: number): Segment[] {
  let cursor = 0;
  const next: Segment[] = [];
  let did = false;
  for (const seg of segments) {
    const len = seg.end - seg.start;
    const local = composed - cursor;
    if (!did && local > MIN && local < len - MIN) {
      next.push({ id: seg.id, start: seg.start, end: round(seg.start + local) });
      next.push({ id: newId(), start: round(seg.start + local), end: seg.end });
      did = true;
    } else {
      next.push(seg);
    }
    cursor += len;
  }
  return next;
}

export function sourceAt(segments: Segment[], composed: number) {
  let cursor = 0;
  const total = composedDuration(segments);
  const time = Math.max(0, Math.min(total, composed));
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const len = seg.end - seg.start;
    if (time <= cursor + len || i === segments.length - 1) {
      const local = Math.max(0, Math.min(len, time - cursor));
      return { index: i, source: seg.start + local, composed: cursor + local };
    }
    cursor += len;
  }
  return { index: 0, source: segments[0]?.start || 0, composed: 0 };
}

export function mapWords(words: WordStamp[], segments: Segment[]): TimedWord[] {
  const mapped: TimedWord[] = [];
  for (const word of words) {
    const mid = (Number(word.start) + Number(word.end)) / 2;
    let cursor = 0;
    for (const seg of segments) {
      const len = seg.end - seg.start;
      if (mid >= seg.start && mid < seg.end) {
        const start = cursor + Math.max(0, word.start - seg.start);
        const end = cursor + Math.min(len, word.end - seg.start);
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

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
