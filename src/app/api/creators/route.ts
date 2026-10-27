import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { serializeCreator } from "@/lib/serialize";
import { voiceColumns } from "@/lib/voice";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const creators = await prisma.creator.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ creators: creators.map(serializeCreator) });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "Creator name must be at least 2 characters." }, { status: 400 });
  }

  const creator = await prisma.creator.create({
    data: {
      userId,
      name: name.slice(0, 80),
      niche: String(body?.niche || "").trim().slice(0, 120),
      toneNotes: String(body?.toneNotes || "").trim().slice(0, 2000),
      ...voiceColumns(body),
    },
  });
  return NextResponse.json({ creator: serializeCreator(creator) }, { status: 201 });
}
