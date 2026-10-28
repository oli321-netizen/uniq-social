import path from "path";
import { readdir, access } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { fileResponse } from "@/lib/file-response";
import { assetPath, storageRoot } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; assetId: string } };

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "File not found." }, { status: 404 });
  let file = "";
  try {
    const probe = assetPath(userId, project.id, params.assetId, "mp4");
    const dir = path.dirname(probe);
    const names = await readdir(dir);
    const match = names.find((name) => name.startsWith(`${params.assetId}.`));
    if (!match) return NextResponse.json({ error: "File not found." }, { status: 404 });
    file = path.resolve(dir, match);
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const root = path.resolve(storageRoot());
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  try {
    await access(file);
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  return fileResponse(file, req, TYPES[ext] || "application/octet-stream");
}
