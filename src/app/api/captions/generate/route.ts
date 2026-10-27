import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { generateCaptions } from "@/lib/captions-llm";
import { voiceFromParts } from "@/lib/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const topic = String(body?.topic || "").trim();
  if (topic.length < 2) return NextResponse.json({ error: "Add a topic or hook line first." }, { status: 400 });
  const creatorId = body?.creatorId ? String(body.creatorId) : null;
  let voice = null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
    voice = voiceFromParts(creator);
  }
  const count = Math.min(6, Math.max(1, Number(body?.count) || 4));
  const generated = await generateCaptions({ topic, count, voice });
  return NextResponse.json(generated);
}
