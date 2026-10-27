import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { logResult, parseCsv } from "@/lib/results";

export const dynamic = "force-dynamic";

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const csv = String(body?.csv || "");
  const rows = parseCsv(csv);
  if (rows.length === 0) return NextResponse.json({ error: "CSV needs a header row and at least one result." }, { status: 400 });
  const variants = await prisma.creativeVariant.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, name: true },
  });
  let imported = 0;
  const errors: string[] = [];
  for (const [index, row] of Array.from(rows.entries())) {
    const variantId = pick(row, ["variant_id", "variantid", "id"]);
    const variantName = pick(row, ["variant_name", "variant", "name"]);
    const match = variants.find((variant) => variant.id === variantId) || variants.find((variant) => variant.name.toLowerCase() === variantName.toLowerCase());
    if (!match) {
      errors.push(`Row ${index + 2}: no matching variant.`);
      continue;
    }
    const saved = await logResult(userId, {
      variantId: match.id,
      platform: pick(row, ["platform"]) || "csv",
      views: Number(pick(row, ["views"]) || 0),
      viewRate3s: Number(pick(row, ["view_rate_3s", "hook_rate", "viewrate3s"]) || 0),
      avgWatchSec: Number(pick(row, ["avg_watch_s", "avg_watch_sec", "watch"]) || 0),
      shares: Number(pick(row, ["shares"]) || 0),
      saves: Number(pick(row, ["saves"]) || 0),
      follows: Number(pick(row, ["follows"]) || 0),
      postedAt: pick(row, ["posted_at", "posted"]) || null,
      source: "csv",
    });
    if ("error" in saved) errors.push(`Row ${index + 2}: ${saved.error}`);
    else imported += 1;
  }
  return NextResponse.json({ imported, errors });
}
