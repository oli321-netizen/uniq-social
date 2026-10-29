import path from "path";
import { access } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { storageRoot } from "@/lib/storage";
import { ensureWaveform } from "@/lib/media-preview";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project?.storageKey || !owned(project.storageKey)) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  try {
    await access(project.storageKey);
    const waveform = await ensureWaveform(project.storageKey, project.durationSec || 1);
    return NextResponse.json(waveform);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the waveform.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function owned(filePath: string) {
  const root = path.resolve(storageRoot());
  const file = path.resolve(filePath);
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
