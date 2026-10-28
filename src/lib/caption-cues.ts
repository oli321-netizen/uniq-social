import { mapWords, newId, type Segment, type WordStamp } from "@/lib/edit-timeline";

export type CueWord = { text: string; start: number; end: number; emphasis: boolean };
export type CaptionCue = { id: string; start: number; end: number; words: CueWord[] };

const EMPHASIS = new Set(["never", "stop", "stopped", "first", "secret", "money", "wrong", "always", "now", "why", "how"]);

export function isEmphasis(word: string) {
  const clean = word.replace(/[^A-Za-z]/g, "");
  if (clean.length < 3) return false;
  if (clean === clean.toUpperCase() && /[A-Z]/.test(clean)) return true;
  if (clean.length >= 7) return true;
  return EMPHASIS.has(clean.toLowerCase());
}

export function buildCues(words: WordStamp[], segments: Segment[]): CaptionCue[] {
  const timed = mapWords(words, segments);
  const groups: typeof timed[] = [];
  let current: typeof timed = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  for (const word of timed) {
    const previous = current[current.length - 1];
    const gap = previous ? word.composedStart - previous.composedEnd > 0.45 : false;
    if (current.length && (current.length >= 4 || gap)) flush();
    current.push(word);
    if (/[.!?]$/.test(word.word)) flush();
  }
  flush();
  return groups.map((group) => ({
    id: newId(),
    start: round(group[0].composedStart),
    end: round(group[group.length - 1].composedEnd),
    words: group.map((word) => ({
      text: word.word,
      start: round(word.composedStart),
      end: round(word.composedEnd),
      emphasis: isEmphasis(word.word),
    })),
  }));
}

export function parseCues(raw: unknown): CaptionCue[] {
  if (!Array.isArray(raw)) return [];
  const cues: CaptionCue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const start = Number((item as { start?: unknown }).start);
    const end = Number((item as { end?: unknown }).end);
    const wordsRaw = (item as { words?: unknown }).words;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.08 || !Array.isArray(wordsRaw)) continue;
    const words: CueWord[] = [];
    for (const word of wordsRaw) {
      if (!word || typeof word !== "object") continue;
      const text = String((word as { text?: unknown }).text || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const wordStart = Number((word as { start?: unknown }).start);
      const wordEnd = Number((word as { end?: unknown }).end);
      if (!text || !Number.isFinite(wordStart) || !Number.isFinite(wordEnd) || wordEnd <= wordStart) continue;
      words.push({ text, start: wordStart, end: wordEnd, emphasis: Boolean((word as { emphasis?: unknown }).emphasis) });
      if (words.length >= 12) break;
    }
    if (words.length === 0) continue;
    cues.push({ id: String((item as { id?: unknown }).id || newId()).slice(0, 80), start, end, words });
    if (cues.length >= 400) break;
  }
  return cues;
}

export function moveCue(cue: CaptionCue, delta: number, limit: number): CaptionCue {
  const start = clamp(cue.start + delta, 0, Math.max(0, limit - 0.12));
  const shift = start - cue.start;
  const end = Math.min(limit, cue.end + shift);
  return {
    ...cue,
    start: round(start),
    end: round(Math.max(start + 0.12, end)),
    words: cue.words.map((word) => ({ ...word, start: round(word.start + shift), end: round(word.end + shift) })),
  };
}

export function resizeCue(cue: CaptionCue, edge: "start" | "end", nextEdge: number, limit: number): CaptionCue {
  const start = edge === "start" ? clamp(nextEdge, 0, cue.end - 0.12) : cue.start;
  const end = edge === "end" ? clamp(nextEdge, cue.start + 0.12, limit) : cue.end;
  const oldLen = Math.max(0.04, cue.end - cue.start);
  const newLen = Math.max(0.12, end - start);
  return {
    ...cue,
    start: round(start),
    end: round(end),
    words: cue.words.map((word) => {
      const relA = (word.start - cue.start) / oldLen;
      const relB = (word.end - cue.start) / oldLen;
      return { ...word, start: round(start + relA * newLen), end: round(start + Math.max(relA + 0.04, relB) * newLen) };
    }),
  };
}

export function breakCueLines(words: CueWord[], maxChars = 16) {
  const lines: CueWord[][] = [];
  let line: CueWord[] = [];
  let count = 0;
  for (const word of words) {
    const len = word.text.length;
    if (line.length && count + 1 + len > maxChars) {
      lines.push(line);
      line = [];
      count = 0;
    }
    line.push(word);
    count += (count > 0 ? 1 : 0) + len;
  }
  if (line.length) lines.push(line);
  return lines;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
