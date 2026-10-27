import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { readProject } from "@/lib/hook-project";
import { clampSegments, parseWords } from "@/lib/edit-timeline";
import { parseStyle } from "@/lib/caption-ass";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project: readProject(project) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const existing = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const words = body?.words !== undefined ? parseWords(body.words) : parseWords(JSON.parse(existing.wordsJson));
  const segments = clampSegments(
    body?.segments !== undefined && Array.isArray(body.segments) ? body.segments : JSON.parse(existing.segmentsJson),
    existing.durationSec
  );
  const style = parseStyle(body?.style !== undefined ? body.style : JSON.parse(existing.styleJson));
  const transcript = body?.transcript !== undefined ? String(body.transcript).slice(0, 100000) : existing.transcript;
  const project = await prisma.hookProject.update({
    where: { id: existing.id },
    data: {
      wordsJson: JSON.stringify(words),
      segmentsJson: JSON.stringify(segments),
      styleJson: JSON.stringify(style),
      transcript,
    },
  });
  return NextResponse.json({ project: readProject(project) });
}
