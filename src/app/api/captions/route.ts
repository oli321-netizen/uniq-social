import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { stripHashtags } from "@/lib/voice";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  const variantId = req.nextUrl.searchParams.get("variantId");
  const captions = await prisma.caption.findMany({
    where: {
      userId,
      ...(creatorId ? { creatorId } : {}),
      ...(variantId ? { variantId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return NextResponse.json({
    captions: captions.map((caption) => ({
      id: caption.id,
      creatorId: caption.creatorId,
      variantId: caption.variantId,
      topic: caption.topic,
      text: caption.text,
      createdAt: caption.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const text = stripHashtags(String(body?.text || ""));
  if (text.length < 8 || text.includes("#")) {
    return NextResponse.json({ error: "Caption is too short, or it still contains a hashtag." }, { status: 400 });
  }
  const creatorId = body?.creatorId ? String(body.creatorId) : null;
  const variantId = body?.variantId ? String(body.variantId) : null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }
  if (variantId) {
    const variant = await prisma.creativeVariant.findFirst({ where: { id: variantId, userId, deletedAt: null } });
    if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }
  const caption = await prisma.caption.create({
    data: {
      userId,
      creatorId,
      variantId,
      topic: String(body?.topic || "").slice(0, 200),
      text: text.slice(0, 400),
    },
  });
  return NextResponse.json({
    caption: {
      id: caption.id,
      creatorId: caption.creatorId,
      variantId: caption.variantId,
      topic: caption.topic,
      text: caption.text,
      createdAt: caption.createdAt.toISOString(),
    },
  }, { status: 201 });
}
