import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { serializeCreator } from "@/lib/serialize";
import { voiceColumns } from "@/lib/voice";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

async function owned(userId: string, id: string) {
  return prisma.creator.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const existing = await owned(userId, params.id);
  if (!existing) return NextResponse.json({ error: "Creator not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = body?.name !== undefined ? String(body.name).trim() : existing.name;
  if (name.length < 2) {
    return NextResponse.json({ error: "Creator name must be at least 2 characters." }, { status: 400 });
  }

  const creator = await prisma.creator.update({
    where: { id: existing.id },
    data: {
      name: name.slice(0, 80),
      niche: body?.niche !== undefined ? String(body.niche).trim().slice(0, 120) : existing.niche,
      toneNotes:
        body?.toneNotes !== undefined ? String(body.toneNotes).trim().slice(0, 2000) : existing.toneNotes,
      ...voiceColumns(body),
    },
  });
  return NextResponse.json({ creator: serializeCreator(creator) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const existing = await owned(userId, params.id);
  if (!existing) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  await prisma.creator.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
