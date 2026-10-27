import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { assetPath, saveBytes } from "@/lib/storage";
import { hasAudio, mediaDuration } from "@/lib/transcribe";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const EXT: Record<string, string> = {
  mp4: "mp4",
  mov: "mov",
  webm: "webm",
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  webp: "webp",
  mp3: "mp3",
  wav: "wav",
  m4a: "m4a",
};

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const upload = form?.get("file");
  if (!upload || typeof upload === "string" || typeof (upload as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Choose a video, image, or audio file." }, { status: 400 });
  }
  const file = upload as { arrayBuffer: () => Promise<ArrayBuffer>; name?: string; type?: string; size: number };
  const type = String(file.type || "");
  const kind = type.startsWith("image/") ? "image" : type.startsWith("audio/") ? "audio" : type.startsWith("video/") ? "video" : "";
  if (!kind) return NextResponse.json({ error: "Use a video, image, or audio file." }, { status: 400 });
  const limit = kind === "image" ? 20 * 1024 * 1024 : kind === "audio" ? 30 * 1024 * 1024 : 250 * 1024 * 1024;
  if (file.size > limit) return NextResponse.json({ error: "That file is too large for the editor." }, { status: 400 });
  const fromName = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  const ext = EXT[fromName] || (kind === "image" ? "png" : kind === "audio" ? "mp3" : "mp4");
  const id = randomUUID();
  const dest = assetPath(userId, project.id, id, ext);
  const bytes = Buffer.from(await file.arrayBuffer());
  await saveBytes(dest, bytes);
  let duration = 0;
  if (kind !== "image") {
    try {
      duration = await mediaDuration(dest);
    } catch {
      duration = kind === "audio" ? 0 : 3;
    }
    if (kind === "video" && !(await hasAudio(dest)) && duration <= 0) {
      return NextResponse.json({ error: "Could not read that video." }, { status: 400 });
    }
  }
  return NextResponse.json({
    asset: {
      id,
      kind,
      name: String(file.name || "Import").slice(0, 80),
      duration: Math.max(0, Math.min(600, duration)),
      ext,
    },
  });
}
