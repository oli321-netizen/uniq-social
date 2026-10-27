import type { Creator, Hook, Preset } from "@prisma/client";
import { parseJsonList } from "@/lib/voice";

export function serializeCreator(c: Creator) {
  return {
    id: c.id,
    name: c.name,
    niche: c.niche,
    toneNotes: c.toneNotes,
    handle: c.handle,
    toneChips: parseJsonList(c.toneChips),
    slangPhrases: parseJsonList(c.slangPhrases),
    avoidWords: parseJsonList(c.avoidWords),
    examplePosts: parseJsonList(c.examplePosts),
    voiceStrength: c.voiceStrength,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeHook(h: Hook & { project?: { transcript: string } | null }) {
  let sparkline: number[] = [];
  try {
    const parsed = JSON.parse(h.sparkline);
    if (Array.isArray(parsed)) {
      sparkline = parsed.filter((n) => typeof n === "number");
    }
  } catch {
    sparkline = [];
  }
  return {
    id: h.id,
    creatorId: h.creatorId,
    text: h.text,
    topic: h.topic,
    score: h.score,
    sparkline,
    favourite: h.favourite,
    views: h.views,
    watchTimeSec: h.watchTimeSec,
    hookRate: h.hookRate,
    shareRate: h.shareRate,
    shares: h.shares,
    saves: h.saves,
    follows: h.follows,
    loggedResults: h.loggedResults,
    generationMode: h.generationMode,
    projectId: h.projectId,
    transcript: h.project?.transcript || "",
    createdAt: h.createdAt.toISOString(),
  };
}

export function serializePreset(p: Preset) {
  let dimensions: string[] = [];
  let variantsPerVideo = 3;
  try {
    const parsed = JSON.parse(p.configJson) as { dimensions?: unknown; variantsPerVideo?: unknown };
    if (Array.isArray(parsed.dimensions)) dimensions = parsed.dimensions.map(String);
    const count = Number(parsed.variantsPerVideo);
    if (Number.isFinite(count)) variantsPerVideo = Math.min(12, Math.max(1, Math.round(count)));
  } catch {
    dimensions = [];
  }
  return {
    id: p.id,
    name: p.name,
    creatorId: p.creatorId,
    dimensions,
    variantsPerVideo,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type HookDTO = ReturnType<typeof serializeHook>;
export type CreatorDTO = ReturnType<typeof serializeCreator>;
export type PresetDTO = ReturnType<typeof serializePreset>;
