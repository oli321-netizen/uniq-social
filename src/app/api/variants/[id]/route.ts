import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { removeFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const variant = await prisma.creativeVariant.findFirst({ where: { id: params.id, userId, deletedAt: null } });
  if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  if (variant.storageKey) await removeFile(variant.storageKey).catch(() => {});
  const historyId = variant.batchKey.startsWith("history:") ? variant.batchKey.slice("history:".length) : "";
  await prisma.creativeVariant.update({ where: { id: variant.id }, data: { deletedAt: new Date(), storageKey: null } });
  if (historyId) {
    await prisma.processingHistory.deleteMany({ where: { id: historyId, userId } });
  }
  return NextResponse.json({ ok: true });
}
