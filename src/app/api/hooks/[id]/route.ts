import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { serializeHook } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const existing = await prisma.hook.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ error: "Hook not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const text = body?.text !== undefined ? String(body.text).trim() : existing.text;
  if (!text) return NextResponse.json({ error: "Hook text is required." }, { status: 400 });

  const hook = await prisma.hook.update({
    where: { id: existing.id },
    data: {
      text: text.slice(0, 280),
      favourite: body?.favourite !== undefined ? Boolean(body.favourite) : existing.favourite,
      topic: body?.topic !== undefined ? String(body.topic).trim().slice(0, 200) : existing.topic,
    },
  });
  return NextResponse.json({ hook: serializeHook(hook) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const existing = await prisma.hook.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ error: "Hook not found." }, { status: 404 });
  await prisma.hook.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
