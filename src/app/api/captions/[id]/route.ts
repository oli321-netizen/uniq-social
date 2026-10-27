import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const existing = await prisma.caption.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ error: "Caption not found." }, { status: 404 });
  await prisma.caption.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
