import type { Creator, Hook } from "@prisma/client";

export function serializeCreator(c: Creator) {
  return {
    id: c.id,
    name: c.name,
    niche: c.niche,
    toneNotes: c.toneNotes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeHook(h: Hook) {
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
    createdAt: h.createdAt.toISOString(),
  };
}

export type HookDTO = ReturnType<typeof serializeHook>;
export type CreatorDTO = ReturnType<typeof serializeCreator>;
