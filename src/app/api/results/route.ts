import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { logResult } from "@/lib/results";
import { listSavedRenders } from "@/lib/saved-renders";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  await listSavedRenders(userId);
  const variants = await prisma.creativeVariant.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { results: { orderBy: { createdAt: "desc" } } },
  });
  const rows = variants.map((variant) => {
    const views = variant.results.reduce((sum, row) => sum + row.views, 0);
    const shares = variant.results.reduce((sum, row) => sum + row.shares, 0);
    const saves = variant.results.reduce((sum, row) => sum + row.saves, 0);
    const follows = variant.results.reduce((sum, row) => sum + row.follows, 0);
    const watch = variant.results.length
      ? variant.results.reduce((sum, row) => sum + row.avgWatchSec, 0) / variant.results.length
      : 0;
    return {
      id: variant.id,
      name: variant.name,
      testsDimension: variant.testsDimension,
      hookText: variant.hookText,
      views,
      shares,
      saves,
      follows,
      avgWatchSec: watch,
      logs: variant.results.length,
    };
  });
  const recent = variants
    .flatMap((variant) => variant.results.map((row) => ({ ...row, variantName: variant.name })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 30)
    .map((row) => ({
      id: row.id,
      variantId: row.variantId,
      variantName: row.variantName,
      platform: row.platform,
      views: row.views,
      viewRate3s: row.viewRate3s,
      avgWatchSec: row.avgWatchSec,
      shares: row.shares,
      saves: row.saves,
      follows: row.follows,
      source: row.source,
      postedAt: row.postedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  return NextResponse.json({ rows, recent });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const variantId = String(body?.variantId || "");
  if (!variantId) return NextResponse.json({ error: "Pick a variant." }, { status: 400 });
  const saved = await logResult(userId, {
    variantId,
    platform: body?.platform,
    views: body?.views,
    viewRate3s: body?.viewRate3s,
    avgWatchSec: body?.avgWatchSec,
    shares: body?.shares,
    saves: body?.saves,
    follows: body?.follows,
    postedAt: body?.postedAt,
    source: "manual",
  });
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 404 });
  return NextResponse.json({ ok: true, id: saved.result.id }, { status: 201 });
}
