import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { serializePreset } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const preset = await prisma.preset.findFirst({ where: { id: params.id, userId } });
  if (!preset) return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  return NextResponse.json({ preset: serializePreset(preset) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const preset = await prisma.preset.findFirst({ where: { id: params.id, userId } });
  if (!preset) return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  await prisma.preset.delete({ where: { id: preset.id } });
  return NextResponse.json({ ok: true });
}
