import path from "path";
import { access, readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { storageRoot } from "@/lib/storage";
import { ensureFilmstrip } from "@/lib/media-preview";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project?.storageKey || !owned(project.storageKey)) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  try {
    await access(project.storageKey);
    const strip = await ensureFilmstrip(project.storageKey, project.durationSec || 1);
    const bytes = await readFile(strip.filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
        "X-Frames": String(strip.frames),
        "X-Interval": String(strip.interval),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the filmstrip.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function owned(filePath: string) {
  const root = path.resolve(storageRoot());
  const file = path.resolve(filePath);
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
