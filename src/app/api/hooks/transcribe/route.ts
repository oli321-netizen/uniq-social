import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { projectPath, saveBytes } from "@/lib/storage";
import { mediaDuration, transcribeFile } from "@/lib/transcribe";
import { generateHooks } from "@/lib/hooks-llm";
import { serializeHook } from "@/lib/serialize";
import { voiceFromParts } from "@/lib/voice";
import { readProject } from "@/lib/hook-project";
import { DEFAULT_STYLE } from "@/lib/caption-ass";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const form = await req.formData();
  const upload = form.get("video") || form.get("file");
  if (!upload || typeof upload === "string" || typeof upload.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Choose a video." }, { status: 400 });
  }
  if (upload.size > 250 * 1024 * 1024) {
    return NextResponse.json({ error: "Max video size is 250MB." }, { status: 400 });
  }
  const fileName = String(form.get("fileName") || ("name" in upload ? upload.name : "") || "clip.mp4").slice(0, 120);
  const creatorId = String(form.get("creatorId") || "") || null;
  if (creatorId) {
    const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  const created = await prisma.hookProject.create({
    data: {
      userId,
      creatorId,
      fileName,
      styleJson: JSON.stringify(DEFAULT_STYLE),
    },
  });
  const dest = projectPath(userId, created.id);
  try {
    await saveBytes(dest, Buffer.from(await upload.arrayBuffer()));
    const durationSec = await mediaDuration(dest);
    const spoken = await transcribeFile(dest, durationSec);
    const segments = [{ id: created.id, start: 0, end: durationSec }];
    const project = await prisma.hookProject.update({
      where: { id: created.id },
      data: {
        storageKey: dest,
        durationSec,
        transcript: spoken.text.slice(0, 100000),
        wordsJson: JSON.stringify(spoken.words),
        segmentsJson: JSON.stringify(segments),
      },
    });
    let voice = null;
    if (creatorId) {
      const creator = await prisma.creator.findFirst({ where: { id: creatorId, userId } });
      if (creator) voice = voiceFromParts(creator);
    }
    const generated = await generateHooks({ transcript: spoken.text, count: 5, voice });
    const hooks = [];
    for (const item of generated.hooks) {
      const hook = await prisma.hook.create({
        data: {
          userId,
          creatorId,
          projectId: project.id,
          text: item.text,
          topic: spoken.text.slice(0, 200),
          score: item.score,
          sparkline: "[]",
          generationMode: generated.mode,
        },
        include: { project: { select: { transcript: true } } },
      });
      hooks.push(serializeHook(hook));
    }
    const notice = spoken.stub
      ? `Local stub, not Whisper. ${generated.notice}`
      : generated.notice;
    return NextResponse.json({ project: readProject(project), hooks, notice, mode: generated.mode });
  } catch (error) {
    await prisma.hookProject.delete({ where: { id: created.id } }).catch(() => {});
    await rm(dest, { force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : "Could not transcribe that video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
