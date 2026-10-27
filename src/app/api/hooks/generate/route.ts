import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { generateHooks } from "@/lib/hooks-llm";
import { serializeHook } from "@/lib/serialize";
import { voiceFromParts, voicePrompt } from "@/lib/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const topic = String(body?.topic || "").trim();
  const transcript = String(body?.transcript || "").trim();
  if (!topic && !transcript) {
    return NextResponse.json({ error: "Add a topic or paste a transcript first." }, { status: 400 });
  }

  const count = Math.min(8, Math.max(1, Number(body?.count) || 5));
  const likeText = body?.likeText ? String(body.likeText).trim().slice(0, 280) : undefined;
  const creatorId = body?.creatorId ? String(body.creatorId) : null;

  let toneNotes = "";
  let voice = null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
    voice = voiceFromParts(creator);
    toneNotes = [creator.toneNotes, voicePrompt(voice)].filter(Boolean).join("\n");
  }

  const generated = await generateHooks({ topic, transcript, count, likeText, toneNotes, voice });
  const storedTopic = (topic || transcript).slice(0, 200);

  const hooks = [];
  for (const item of generated.hooks) {
    const hook = await prisma.hook.create({
      data: {
        userId,
        creatorId,
        text: item.text,
        topic: storedTopic,
        score: item.score,
        sparkline: JSON.stringify(item.sparkline),
        generationMode: generated.mode,
      },
    });
    hooks.push(serializeHook(hook));
  }

  return NextResponse.json({ hooks, mode: generated.mode, notice: generated.notice });
}
