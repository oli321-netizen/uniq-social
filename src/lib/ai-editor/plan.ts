import { MAX_VARIANTS, MIN_VARIANTS } from "@/lib/ai-editor/cost";
import { outputLimit, planSegments } from "@/lib/ai-editor/verify";
import type { CaptionLook, ContentKind, EditorSettings, ReadResult, Segment, VariantPlan } from "@/lib/ai-editor/types";

const KINDS: ContentKind[] = ["talking", "process", "before-after", "montage", "product", "gym", "food", "b-roll", "other"];
const LOOKS: CaptionLook[] = ["bold", "karaoke", "minimal"];
const SPEEDS = [1, 1.06, 1.1, 1.04, 1.12];

export function settingsFrom(raw: Partial<EditorSettings> | null | undefined): EditorSettings {
  const style = LOOKS.includes(raw?.captionStyle as CaptionLook) ? (raw?.captionStyle as CaptionLook) : "bold";
  const variants = clamp(raw?.variants, MIN_VARIANTS, MAX_VARIANTS, 3);
  return {
    variants: Math.round(variants),
    captions: raw?.captions === true,
    captionStyle: style,
    mode: raw?.mode === "describe" ? "describe" : "auto",
    prompt: clean(raw?.prompt, 400),
    keepOriginal: raw?.keepOriginal !== false,
    musicVolume: clamp(raw?.musicVolume, 0.05, 1, 0.35),
    duck: raw?.duck !== false,
    fade: raw?.fade !== false,
    beatSync: raw?.beatSync === true,
  };
}

export function buildVariants(read: ReadResult, settings: EditorSettings, salt = 0): VariantPlan[] {
  const count = settings.variants;
  const plans: VariantPlan[] = [];
  for (let index = 0; index < count; index += 1) {
    plans.push(oneVariant(read, settings, index + salt));
  }
  return plans;
}

function oneVariant(read: ReadResult, settings: EditorSettings, index: number): VariantPlan {
  const process = read.kind === "process" || read.kind === "before-after" || read.kind === "food" || read.kind === "gym";
  const talking = read.kind === "talking";
  const safe = clampSegments(planSegments(read, index), read.duration);
  const covered = safe.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const speed = SPEEDS[index % SPEEDS.length];
  const notes = settings.mode === "describe" ? settings.prompt.toLowerCase() : "";
  const zoom = notes.includes("zoom") || (!process && index % 2 === 1) || (process && index % 2 === 1);
  const look = settings.captions ? LOOKS[(LOOKS.indexOf(settings.captionStyle) + index) % LOOKS.length] : settings.captionStyle;
  return {
    title: titleFor(read, safe, index),
    why: whyFor(read, covered < read.duration - 0.35),
    segments: safe,
    speed: notes.includes("slow") ? 1 : speed,
    silence: talking,
    zoom,
    zoomScale: clamp(1.1 + (index % 3) * 0.04, 1.08, 1.22, 1.12),
    captions: settings.captions,
    captionStyle: look,
    captionPosition: index % 3 === 2 ? "middle" : "bottom",
    fontSize: 64,
    keepOriginal: settings.keepOriginal,
    musicVolume: settings.musicVolume,
    musicOffset: round2((index * 0.85) % 12),
    duck: settings.duck,
    fade: settings.fade,
  };
}

export function clampSegments(segments: Segment[], duration: number): Segment[] {
  const limit = outputLimit(duration);
  const out: Segment[] = [];
  for (const segment of segments) {
    const start = clamp(segment.start, 0, Math.max(0, duration - 0.4), 0);
    const end = clamp(segment.end, start + 0.4, duration, Math.min(duration, start + limit));
    if (end - start < 0.4) continue;
    out.push({ start: round2(start), end: round2(end) });
    if (out.length >= 8) break;
  }
  if (!out.length) {
    const length = round2(Math.min(duration, Math.max(0.4, limit)));
    const start = duration > 12 ? round2(Math.max(0, duration - length)) : 0;
    out.push({ start, end: round2(Math.min(duration, start + length)) });
  }
  return out;
}

function titleFor(read: ReadResult, segments: Segment[], index: number) {
  const opening = read.shots.find((shot) => Math.abs(shot.start - segments[0].start) < 0.35);
  const name = clean(opening?.summary || read.summary, 60);
  return name || `Edit ${index + 1}`;
}

function whyFor(read: ReadResult, dropped: boolean) {
  if (read.kind === "process" || read.kind === "before-after" || read.kind === "food" || read.kind === "gym") {
    return dropped
      ? "Kept the ending, stayed in order, and cut this shorter than the original."
      : "Kept each step whole and in order so the process is not cut in half.";
  }
  if (read.kind === "talking") {
    return "Opened on a different line, cut at the end of sentences, and dropped the quiet gaps.";
  }
  return dropped
    ? "Opened on a different shot and left part of the original out."
    : "Opened on a different shot and cut only where the picture changes.";
}

export function applyBeat(plans: VariantPlan[], beats: number[], kind: ContentKind) {
  if (beats.length < 3) return plans;
  const gaps = beats.slice(1).map((time, index) => time - beats[index]).filter((gap) => gap > 0.28 && gap < 1.2);
  if (!gaps.length) return plans;
  gaps.sort((a, b) => a - b);
  const interval = gaps[Math.floor(gaps.length / 2)];
  const montage = kind === "montage" || kind === "b-roll";
  return plans.map((plan) => ({
    ...plan,
    musicOffset: nearest(beats, plan.musicOffset),
    segments: montage
      ? plan.segments.map((segment) => {
          const span = segment.end - segment.start;
          const count = Math.max(1, Math.round(span / plan.speed / interval));
          const target = Math.min(span, Math.max(0.45, count * interval * plan.speed));
          return { start: segment.start, end: round2(segment.start + target) };
        })
      : plan.segments,
  }));
}

function nearest(beats: number[], time: number) {
  return beats.reduce((best, beat) => (Math.abs(beat - time) < Math.abs(best - time) ? beat : best), beats[0]);
}

export function plainKind(kind: ContentKind) {
  if (kind === "talking") return "Someone talking to camera.";
  if (kind === "process" || kind === "before-after") return "A continuous process, kept in one piece.";
  if (kind === "food") return "Food being made, kept step by step.";
  if (kind === "gym") return "A workout, kept move by move.";
  if (kind === "product") return "A product shot.";
  if (kind === "montage" || kind === "b-roll") return "Several shots cut together.";
  return "A clip read from the picture.";
}

export function clampKind(value: unknown): ContentKind {
  const text = String(value || "");
  return KINDS.includes(text as ContentKind) ? (text as ContentKind) : "other";
}

function clean(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
