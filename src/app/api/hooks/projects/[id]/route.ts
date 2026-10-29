import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidUserId } from "@/lib/session";
import { readProject } from "@/lib/hook-project";
import { clampSegments, parseWords } from "@/lib/edit-timeline";
import { parseStyle } from "@/lib/caption-ass";
import { parseCues } from "@/lib/caption-cues";
import { parseEditor } from "@/lib/editor-doc";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const project = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project: readProject(project) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await requirePaidUserId();
  if (typeof userId !== "string") return userId;
  const existing = await prisma.hookProject.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const storedStyle = safeJson(existing.styleJson) as { cues?: unknown; editor?: unknown };
  const words = body?.words !== undefined ? parseWords(body.words) : parseWords(safeJson(existing.wordsJson));
  const storedSegments = safeJson(existing.segmentsJson);
  const segments = clampSegments(
    body?.segments !== undefined && Array.isArray(body.segments) ? body.segments : Array.isArray(storedSegments) ? storedSegments : [],
    existing.durationSec
  );
  const style = parseStyle(body?.style !== undefined ? body.style : storedStyle);
  const cues = parseCues(body?.cues !== undefined ? body.cues : storedStyle?.cues);
  const editor = parseEditor(body?.editor !== undefined ? body.editor : storedStyle?.editor);
  const transcript = body?.transcript !== undefined ? String(body.transcript).slice(0, 100000) : existing.transcript;
  const project = await prisma.hookProject.update({
    where: { id: existing.id },
    data: {
      wordsJson: JSON.stringify(words),
      segmentsJson: JSON.stringify(segments),
      styleJson: JSON.stringify({ ...style, cues, editor }),
      transcript,
    },
  });
  return NextResponse.json({ project: readProject(project) });
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
