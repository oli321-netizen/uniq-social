import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { generateHooks } from "@/lib/hooks-llm";
import { serializeHook } from "@/lib/serialize";
import { voiceFromParts } from "@/lib/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;

  const body = await req.json().catch(() => null);
  const transcript = String(body?.transcript || "").trim();
  if (transcript.length < 8) {
    return NextResponse.json({ error: "Transcribe a video first. Editor Lab will not invent lines." }, { status: 400 });
  }

  const count = Math.min(8, Math.max(1, Number(body?.count) || 5));
  const creatorId = body?.creatorId ? String(body.creatorId) : null;
  const projectId = body?.projectId ? String(body.projectId) : null;

  let voice = null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
    voice = voiceFromParts(creator);
  }
  if (projectId) {
    const project = await prisma.hookProject.findFirst({ where: { id: projectId, userId } });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const generated = await generateHooks({ transcript, count, voice });
  if (generated.hooks.length === 0) {
    return NextResponse.json({ error: generated.notice, hooks: [], mode: generated.mode }, { status: 400 });
  }

  const hooks = [];
  for (const item of generated.hooks) {
    const hook = await prisma.hook.create({
      data: {
        userId,
        creatorId,
        projectId,
        text: item.text,
        topic: transcript.slice(0, 200),
        score: item.score,
        sparkline: "[]",
        generationMode: generated.mode,
      },
      include: { project: { select: { transcript: true } } },
    });
    hooks.push(serializeHook(hook));
  }

  return NextResponse.json({ hooks, mode: generated.mode, notice: generated.notice });
}
