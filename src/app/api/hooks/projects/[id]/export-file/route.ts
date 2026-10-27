import path from "path";
import { access } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { fileResponse } from "@/lib/file-response";
import { storageRoot } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project?.storageKey) return NextResponse.json({ error: "Export not found." }, { status: 404 });
  const file = path.resolve(path.dirname(project.storageKey), `${project.id}-export.mp4`);
  const root = path.resolve(storageRoot());
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Export not found." }, { status: 404 });
  }
  try {
    await access(file);
  } catch {
    return NextResponse.json({ error: "Export the video before downloading." }, { status: 404 });
  }
  const name = `${(project.fileName || "editor-lab").replace(/"/g, "")}-captions.mp4`;
  return fileResponse(file, req, "video/mp4", name);
}
