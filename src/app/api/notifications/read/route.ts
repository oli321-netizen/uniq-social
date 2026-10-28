import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const now = new Date();
  if (body?.all) {
    await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
    return NextResponse.json({ ok: true });
  }
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Missing notification." }, { status: 400 });
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  await prisma.notification.update({ where: { id }, data: { readAt: now } });
  return NextResponse.json({ ok: true });
}
