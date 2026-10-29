import type { WordStamp } from "@/lib/edit-timeline";

export type CaptionLook = "bold" | "karaoke" | "minimal";
export type CaptionPlace = "top" | "middle" | "bottom";
export type FrameAspect = "original" | "9:16";

export type ZoomMoment = { start: number; end: number };

export type AiPlan = {
  captions: boolean;
  captionStyle: CaptionLook;
  captionPosition: CaptionPlace;
  fontSize: number;
  language: string;
  silence: boolean;
  silenceDb: number;
  silenceMin: number;
  tighten: boolean;
  speed: number;
  zoom: boolean;
  zoomScale: number;
  zoomMoments: ZoomMoment[];
  aspect: FrameAspect;
  trimStart: number;
  trimEnd: number;
};

export type AiClip = {
  id: string;
  title: string;
  hook: string;
  reason: string;
  start: number;
  end: number;
  enabled: boolean;
  silence: boolean;
  tighten: boolean;
  speed: number;
  zoom: boolean;
  zoomScale: number;
  zoomMoments: ZoomMoment[];
  aspect: FrameAspect;
};

export type ManualToggles = {
  captions: boolean;
  captionStyle: CaptionLook;
  captionPosition: CaptionPlace;
  fontSize: number;
  language: string;
  autoEdit: boolean;
  silence: boolean;
  zoom: boolean;
  vertical: boolean;
};

const LOOKS: CaptionLook[] = ["bold", "karaoke", "minimal"];
const PLACES: CaptionPlace[] = ["top", "middle", "bottom"];

export function manualPlan(toggles: ManualToggles, duration: number, words: WordStamp[]): AiPlan {
  return clampPlan(
    {
      captions: toggles.captions,
      captionStyle: toggles.captionStyle,
      captionPosition: toggles.captionPosition,
      fontSize: toggles.fontSize,
      language: toggles.language || "auto",
      silence: toggles.autoEdit && toggles.silence,
      silenceDb: -32,
      silenceMin: 0.4,
      tighten: toggles.autoEdit,
      speed: toggles.autoEdit ? 1.08 : 1,
      zoom: toggles.autoEdit && toggles.zoom,
      zoomScale: 1.18,
      zoomMoments: [],
      aspect: toggles.vertical ? "9:16" : "original",
      trimStart: 0,
      trimEnd: 0,
    },
    duration,
    words
  );
}

export function clampPlan(raw: unknown, duration: number, words: WordStamp[]): AiPlan {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const style = LOOKS.includes(value.captionStyle as CaptionLook) ? (value.captionStyle as CaptionLook) : "bold";
  const position = PLACES.includes(value.captionPosition as CaptionPlace) ? (value.captionPosition as CaptionPlace) : "bottom";
  const aspect = value.aspect === "9:16" ? "9:16" : "original";
  const language = /^[a-z]{2}$/i.test(String(value.language || "")) ? String(value.language).toLowerCase() : "auto";
  const zoom = bool(value.zoom);
  const moments = zoom ? clampMoments(value.zoomMoments, duration) : [];
  const plan: AiPlan = {
    captions: bool(value.captions),
    captionStyle: style,
    captionPosition: position,
    fontSize: clamp(value.fontSize, 32, 96, 64),
    language,
    silence: bool(value.silence),
    silenceDb: clamp(value.silenceDb, -45, -20, -32),
    silenceMin: clamp(value.silenceMin, 0.25, 1.2, 0.4),
    tighten: bool(value.tighten),
    speed: bool(value.tighten) ? clamp(value.speed, 1, 1.2, 1.08) : 1,
    zoom,
    zoomScale: clamp(value.zoomScale, 1.08, 1.35, 1.18),
    zoomMoments: moments,
    aspect,
    trimStart: clamp(value.trimStart, 0, Math.min(5, Math.max(0, duration - 0.5)), 0),
    trimEnd: clamp(value.trimEnd, 0, Math.min(5, Math.max(0, duration - 0.5)), 0),
  };
  if (plan.zoom && plan.zoomMoments.length === 0) plan.zoomMoments = emphasisMoments(words, duration);
  return plan;
}

export function planLines(plan: AiPlan): string[] {
  const lines = [
    plan.captions
      ? `Captions: ${labelStyle(plan.captionStyle)}, ${plan.captionPosition}, size ${plan.fontSize}, language ${plan.language}.`
      : "Captions off.",
    plan.silence ? `Remove silences quieter than ${plan.silenceDb} dB that last ${plan.silenceMin}s.` : "Keep silences.",
    plan.tighten ? `Tighten pacing to ${plan.speed.toFixed(2)}×.` : "Keep the original speed.",
    plan.zoom ? `Zoom to ${plan.zoomScale.toFixed(2)}× on ${plan.zoomMoments.length} moment${plan.zoomMoments.length === 1 ? "" : "s"}.` : "No zoom punch-ins.",
    plan.aspect === "9:16" ? "Frame: 9:16 centre crop." : "Frame: original.",
  ];
  if (plan.trimStart > 0 || plan.trimEnd > 0) lines.push(`Trim ${plan.trimStart.toFixed(2)}s from the start and ${plan.trimEnd.toFixed(2)}s from the end.`);
  return lines;
}

export async function planFromPrompt(prompt: string, transcript: string, toggles: ManualToggles, duration: number, words: WordStamp[]) {
  const base = manualPlan(toggles, duration, words);
  const key = process.env.OPENAI_API_KEY || "";
  if (!prompt.trim()) return { plan: base, notice: "", usedModel: false };
  if (!key) {
    return { plan: base, notice: "The prompt box needs OPENAI_API_KEY. The switches below are used instead.", usedModel: false };
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return one JSON object for a video edit. Keys: captions boolean, captionStyle bold|karaoke|minimal, captionPosition top|middle|bottom, fontSize number, language auto or a 2 letter code, silence boolean, silenceDb number, silenceMin number, tighten boolean, speed number, zoom boolean, zoomScale number, zoomMoments array of {start,end} in seconds, aspect original|9:16, trimStart number, trimEnd number. Use only the transcript. Do not add hashtags.",
        },
        {
          role: "user",
          content: `Prompt: ${prompt.slice(0, 800)}\nDuration: ${duration.toFixed(2)}s\nSwitches already on: ${JSON.stringify(toggles)}\nTranscript: ${transcript.slice(0, 6000)}`,
        },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    return { plan: base, notice: `The prompt could not be planned (${res.status}). The switches below are used instead.`, usedModel: false };
  }
  let parsed: unknown = {};
  try {
    const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
    parsed = JSON.parse(String(data.choices?.[0]?.message?.content || "{}"));
  } catch {
    return { plan: base, notice: "The model reply was not usable JSON. The switches below are used instead.", usedModel: false };
  }
  return { plan: clampPlan(parsed, duration, words), notice: "", usedModel: true };
}

const MIN_CLIP = 1.2;
const MAX_CLIP = 45;
const MAX_CLIPS = 5;

type Sentence = { start: number; end: number; text: string; words: WordStamp[] };

export async function clipsFromSpeech(transcript: string, duration: number, words: WordStamp[]) {
  const fallback = heuristicClips(words, duration);
  if (!fallback.length) throw new Error("No speech found to cut into clips.");
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) {
    return { clips: fallback, notice: "Full auto clip ideas need OPENAI_API_KEY. These clips follow sentence breaks in the transcript.", usedModel: false };
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return one JSON object {\"clips\":[...]}. Pick 3 to 5 short clips when the transcript is long enough, otherwise fewer. Each clip keys: title, hook, reason, start, end, zoomScale, zoomMoments as {start,end} seconds. start and end sit on sentence boundaries inside the duration. hook is a line from that clip. reason is one short sentence. Use only the transcript. Do not add hashtags.",
        },
        { role: "user", content: `Duration: ${duration.toFixed(2)}s\nTranscript: ${transcript.slice(0, 6000)}` },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    return { clips: fallback, notice: `Clip ideas could not be planned (${res.status}). These clips follow sentence breaks instead.`, usedModel: false };
  }
  try {
    const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(String(data.choices?.[0]?.message?.content || "{}")) as { clips?: unknown };
    const clips = clampClips(parsed, duration, words);
    if (!clips.length) {
      return { clips: fallback, notice: "The model reply was not usable JSON. These clips follow sentence breaks instead.", usedModel: false };
    }
    return { clips, notice: "", usedModel: true };
  } catch {
    return { clips: fallback, notice: "The model reply was not usable JSON. These clips follow sentence breaks instead.", usedModel: false };
  }
}

export function clampClips(raw: unknown, duration: number, words: WordStamp[]): AiClip[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { clips?: unknown }).clips)
    ? (raw as { clips: unknown[] }).clips
    : Array.isArray(raw)
      ? raw
      : [];
  const sentences = sentenceRanges(words, duration);
  const clips: AiClip[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const snapped = snapRange(Number(record.start), Number(record.end), sentences, duration);
    if (!snapped) continue;
    const localWords = words.filter((word) => mid(word) >= snapped.start && mid(word) < snapped.end);
    const zoomMoments = momentsInside(record.zoomMoments, snapped, localWords);
    clips.push({
      id: `c${clips.length + 1}`,
      title: cleanText(record.title, 60) || titleFrom(localWords),
      hook: cleanText(record.hook, 110) || cleanText(localWords.map((word) => word.word).join(" "), 110),
      reason: cleanText(record.reason, 180) || "Cut on a sentence boundary.",
      start: round2(snapped.start),
      end: round2(snapped.end),
      enabled: record.enabled !== false,
      silence: true,
      tighten: true,
      speed: clamp(record.speed, 1.04, 1.12, 1.08),
      zoom: true,
      zoomScale: clamp(record.zoomScale, 1.08, 1.22, 1.12),
      zoomMoments,
      aspect: "9:16",
    });
    if (clips.length >= MAX_CLIPS) break;
  }
  return separate(clips, duration);
}

export function heuristicClips(words: WordStamp[], duration: number): AiClip[] {
  const sentences = mergeShort(splitLong(sentenceRanges(words, duration), duration)).slice(0, MAX_CLIPS);
  return separate(
    sentences.map((sentence) => ({
      id: "c0",
      title: titleFrom(sentence.words),
      hook: cleanText(sentence.text, 110),
      reason: "Sentence break in the transcript.",
      start: round2(sentence.start),
      end: round2(sentence.end),
      enabled: true,
      silence: true,
      tighten: true,
      speed: 1.08,
      zoom: true,
      zoomScale: 1.12,
      zoomMoments: momentsInside([], sentence, sentence.words),
      aspect: "9:16" as const,
    })),
    duration
  );
}

function sentenceRanges(words: WordStamp[], duration: number): Sentence[] {
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
  const source = groups.length === 1 && words.length >= 12 && duration >= 8 ? chunk(words, 3) : groups;
  return source.map((group) => toSentence(group, duration)).filter((sentence) => sentence.end > sentence.start);
}

function chunk(words: WordStamp[], parts: number) {
  const size = Math.max(1, Math.ceil(words.length / parts));
  const groups: WordStamp[][] = [];
  for (let index = 0; index < words.length; index += size) groups.push(words.slice(index, index + size));
  return groups;
}

function toSentence(group: WordStamp[], duration: number): Sentence {
  return {
    start: Math.max(0, group[0].start - 0.05),
    end: Math.min(duration, group[group.length - 1].end + 0.12),
    text: group.map((word) => word.word).join(" "),
    words: group,
  };
}

function splitLong(sentences: Sentence[], duration: number) {
  const out: Sentence[] = [];
  for (const sentence of sentences) {
    if (sentence.end - sentence.start <= MAX_CLIP || sentence.words.length < 2) {
      out.push(sentence);
      continue;
    }
    let group: WordStamp[] = [];
    let origin = sentence.words[0].start;
    for (const word of sentence.words) {
      group.push(word);
      if (word.end - origin >= 12) {
        out.push(toSentence(group, duration));
        group = [];
        origin = word.end;
      }
    }
    if (group.length) out.push(toSentence(group, duration));
  }
  return out;
}

function mergeShort(sentences: Sentence[]) {
  const merged: Sentence[] = [];
  for (const sentence of sentences) {
    const prev = merged[merged.length - 1];
    const short = sentence.end - sentence.start < MIN_CLIP || (prev && prev.end - prev.start < MIN_CLIP);
    if (prev && short && sentence.end - prev.start <= MAX_CLIP) {
      prev.end = sentence.end;
      prev.text = `${prev.text} ${sentence.text}`.trim();
      prev.words = prev.words.concat(sentence.words);
    } else {
      merged.push({ ...sentence, words: sentence.words.slice() });
    }
  }
  return merged.filter((sentence) => sentence.end - sentence.start >= MIN_CLIP && sentence.end - sentence.start <= MAX_CLIP + 0.2);
}

function snapRange(start: number, end: number, sentences: Sentence[], duration: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (!sentences.length) {
    const a = clamp(start, 0, Math.max(0, duration - MIN_CLIP), 0);
    const b = clamp(end, a + MIN_CLIP, duration, Math.min(duration, a + 8));
    if (b - a < MIN_CLIP) return null;
    return { start: a, end: Math.min(b, a + MAX_CLIP) };
  }
  const overlapping = sentences.filter((sentence) => sentence.end > start + 0.05 && sentence.start < end - 0.05);
  const chosen = overlapping.length ? overlapping : [nearestSentence(sentences, (start + end) / 2)];
  const range = { start: chosen[0].start, end: chosen[chosen.length - 1].end };
  if (range.end - range.start > MAX_CLIP) range.end = Math.min(duration, range.start + MAX_CLIP);
  if (range.end - range.start < MIN_CLIP) return null;
  return range;
}

function nearestSentence(sentences: Sentence[], time: number) {
  return sentences.reduce((best, sentence) => {
    const dist = Math.abs((sentence.start + sentence.end) / 2 - time);
    const bestDist = Math.abs((best.start + best.end) / 2 - time);
    return dist < bestDist ? sentence : best;
  });
}

function momentsInside(raw: unknown, range: { start: number; end: number }, words: WordStamp[]) {
  const fitted = clampMoments(raw, range.end)
    .map((moment) => ({ start: Math.max(range.start, moment.start), end: Math.min(range.end, moment.end) }))
    .filter((moment) => moment.end - moment.start >= 0.3 && moment.end - moment.start <= 2.5)
    .slice(0, 3);
  if (fitted.length) return fitted;
  return emphasisMoments(words, range.end)
    .map((moment) => ({ start: Math.max(range.start, moment.start), end: Math.min(range.end, moment.end) }))
    .filter((moment) => moment.end - moment.start >= 0.3)
    .slice(0, 2);
}

function separate(clips: AiClip[], duration: number) {
  const out: AiClip[] = [];
  for (const clip of clips.slice().sort((a, b) => a.start - b.start)) {
    const prev = out[out.length - 1];
    const start = prev && clip.start < prev.end ? prev.end : clip.start;
    const end = Math.min(clip.end, duration);
    if (end - start < MIN_CLIP) continue;
    const zoomMoments = clip.zoomMoments
      .map((moment) => ({ start: Math.max(start, moment.start), end: Math.min(end, moment.end) }))
      .filter((moment) => moment.end - moment.start >= 0.3);
    out.push({ ...clip, id: `c${out.length + 1}`, start: round2(start), end: round2(end), zoomMoments });
  }
  return out;
}

function titleFrom(words: WordStamp[]) {
  const title = cleanText(words.slice(0, 5).map((word) => word.word.replace(/[.!?,]/g, "")).join(" "), 60);
  return title || "Clip";
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function mid(word: WordStamp) {
  return (word.start + word.end) / 2;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function emphasisMoments(words: WordStamp[], duration: number): ZoomMoment[] {
  const picks = words.filter((word) => word.word.replace(/[^A-Za-z]/g, "").length >= 6).slice(0, 4);
  return picks
    .map((word) => ({ start: Math.max(0, word.start - 0.05), end: Math.min(duration, word.start + 0.7) }))
    .filter((moment) => moment.end - moment.start >= 0.3);
}

function clampMoments(raw: unknown, duration: number): ZoomMoment[] {
  if (!Array.isArray(raw)) return [];
  const moments: ZoomMoment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const start = clamp((item as { start?: unknown }).start, 0, duration, 0);
    const end = clamp((item as { end?: unknown }).end, 0, duration, start + 0.6);
    if (end - start < 0.3 || end - start > 2.5) continue;
    moments.push({ start, end });
    if (moments.length >= 6) break;
  }
  return moments;
}

function labelStyle(style: CaptionLook) {
  if (style === "karaoke") return "Karaoke word highlight in purple";
  if (style === "minimal") return "Minimal lower third";
  return "Bold white with outline";
}

function bool(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
