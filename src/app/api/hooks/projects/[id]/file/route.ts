import path from "path";
import { access } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { fileResponse } from "@/lib/file-response";
import { storageRoot } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project?.storageKey) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  const root = path.resolve(storageRoot());
  const file = path.resolve(project.storageKey);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }
  try {
    await access(file);
  } catch {
    return NextResponse.json({ error: "The video file is missing." }, { status: 404 });
  }
  return fileResponse(file, req, "video/mp4");
}
