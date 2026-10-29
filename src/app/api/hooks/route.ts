import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { serializeHook } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const creatorId = req.nextUrl.searchParams.get("creatorId");
  const projectId = req.nextUrl.searchParams.get("projectId");

  const hooks = await prisma.hook.findMany({
    where: {
      userId,
      ...(creatorId ? { creatorId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    include: { project: { select: { transcript: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ hooks: hooks.map(serializeHook) });
}

export async function POST(req: NextRequest) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const body = await req.json().catch(() => null);
  const text = String(body?.text || "").trim();
  if (!text) return NextResponse.json({ error: "Hook text is required." }, { status: 400 });

  const creatorId = body?.creatorId ? String(body.creatorId) : null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  const hook = await prisma.hook.create({
    data: {
      userId,
      creatorId,
      text: text.slice(0, 280),
      topic: String(body?.topic || "").trim().slice(0, 200),
      score: 0,
      sparkline: "[]",
      generationMode: "manual",
    },
  });
  return NextResponse.json({ hook: serializeHook(hook) }, { status: 201 });
}
