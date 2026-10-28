import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { historyKey, listSavedRenders } from "@/lib/saved-renders";
import { saveBytes, variantPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const variants = await listSavedRenders(userId);
  return NextResponse.json({ variants });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  const historyId = String(form.get("historyId") || "");
  // Node 18 production has no global File, so do not use instanceof File.
  const upload = file && typeof file !== "string" ? file : null;
  if (!upload || typeof upload.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Choose the rendered file." }, { status: 400 });
  }
  if (upload.size > 500 * 1024 * 1024) {
    return NextResponse.json({ error: "Max file size is 500MB." }, { status: 400 });
  }
  if (!historyId) return NextResponse.json({ error: "Missing render record." }, { status: 400 });
  const history = await prisma.processingHistory.findFirst({ where: { id: historyId, userId } });
  if (!history) return NextResponse.json({ error: "Render record not found." }, { status: 404 });
  await listSavedRenders(userId);
  const variant = await prisma.creativeVariant.findFirst({
    where: { userId, batchKey: historyKey(historyId), deletedAt: null },
  });
  if (!variant) return NextResponse.json({ error: "Render record not found." }, { status: 404 });
  const dest = variantPath(userId, variant.id);
  await saveBytes(dest, Buffer.from(await upload.arrayBuffer()));
  const durationSec = Number(form.get("durationSec"));
  await prisma.creativeVariant.update({
    where: { id: variant.id },
    data: {
      storageKey: dest,
      status: "ready",
      progress: 100,
      durationSec: Number.isFinite(durationSec) ? durationSec : variant.durationSec,
    },
  });
  const variants = await listSavedRenders(userId);
  return NextResponse.json({ ok: true, variant: variants.find((item) => item.id === variant.id) });
}
