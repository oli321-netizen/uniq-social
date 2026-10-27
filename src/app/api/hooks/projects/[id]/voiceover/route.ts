import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { assetPath, saveBytes } from "@/lib/storage";
import { mediaDuration } from "@/lib/transcribe";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return NextResponse.json({ error: "Write a line to speak." }, { status: 400 });
  const id = randomUUID();
  const key = process.env.OPENAI_API_KEY;
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-voice-"));
  try {
    if (key) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "tts-1", voice: "alloy", input: text }),
      });
      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json({ error: `OpenAI ${res.status}: ${detail.slice(0, 240)}` }, { status: 400 });
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const dest = assetPath(userId, project.id, id, "mp3");
      await saveBytes(dest, bytes);
      const duration = await mediaDuration(dest).catch(() => 0);
      return NextResponse.json({
        asset: { id, kind: "audio", name: "Voice-over", duration, ext: "mp3" },
        notice: "OpenAI voice.",
      });
    }
    const wav = path.join(dir, "voice.wav");
    await execFileAsync("espeak-ng", ["-s", "150", "-w", wav, text], { timeout: 20000 });
    const bytes = await readFile(wav);
    const dest = assetPath(userId, project.id, id, "wav");
    await saveBytes(dest, bytes);
    const duration = await mediaDuration(dest).catch(() => 0);
    return NextResponse.json({
      asset: { id, kind: "audio", name: "Voice-over", duration, ext: "wav" },
      notice: "Local voice from espeak. OpenAI text-to-speech is used when OPENAI_API_KEY is set.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not make a voice-over.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 400 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
