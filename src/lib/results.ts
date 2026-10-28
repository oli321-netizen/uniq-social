import { prisma } from "@/lib/prisma";
import { notifyWinner } from "@/lib/notify";

export type ResultInput = {
  variantId: string;
  platform?: string;
  views?: number;
  viewRate3s?: number;
  avgWatchSec?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  postedAt?: string | null;
  source?: string;
};

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] || "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      out.push(current);
      current = "";
    } else current += char;
  }
  out.push(current);
  return out;
}

export async function refreshHook(hookId: string) {
  const results = await prisma.variantResult.findMany({
    where: { variant: { hookId } },
  });
  const views = results.reduce((sum, row) => sum + row.views, 0);
  const shares = results.reduce((sum, row) => sum + row.shares, 0);
  const saves = results.reduce((sum, row) => sum + row.saves, 0);
  const follows = results.reduce((sum, row) => sum + row.follows, 0);
  const watch = results.length ? results.reduce((sum, row) => sum + row.avgWatchSec, 0) / results.length : 0;
  const hookRate = results.length ? results.reduce((sum, row) => sum + row.viewRate3s, 0) / results.length : 0;
  await prisma.hook.update({
    where: { id: hookId },
    data: {
      views,
      shares,
      saves,
      follows,
      watchTimeSec: watch,
      hookRate,
      shareRate: views > 0 ? shares / views : 0,
      loggedResults: results.length,
    },
  });
}

export async function logResult(userId: string, input: ResultInput) {
  const variant = await prisma.creativeVariant.findFirst({
    where: { id: input.variantId, userId, deletedAt: null },
  });
  if (!variant) return { error: "Variant not found." as const };
  const posted = input.postedAt ? new Date(input.postedAt) : null;
  const result = await prisma.variantResult.create({
    data: {
      userId,
      variantId: variant.id,
      platform: String(input.platform || "manual").slice(0, 40) || "manual",
      views: Math.max(0, Math.round(num(input.views))),
      viewRate3s: Math.max(0, num(input.viewRate3s)),
      avgWatchSec: Math.max(0, num(input.avgWatchSec)),
      shares: Math.max(0, Math.round(num(input.shares))),
      saves: Math.max(0, Math.round(num(input.saves))),
      follows: Math.max(0, Math.round(num(input.follows))),
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : null,
      source: input.source === "csv" ? "csv" : "manual",
    },
  });
  if (variant.hookId) await refreshHook(variant.hookId);
  await notifyWinner(userId, variant.id, variant.name);
  return { result, variant };
}
