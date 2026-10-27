import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { parseStyle } from "@/lib/caption-ass";
import { parseEditor } from "@/lib/editor-doc";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const rows = await prisma.editorTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 40 });
  return NextResponse.json({
    templates: rows.map((row) => ({ id: row.id, name: row.name, doc: safe(row.docJson) })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Name the template." }, { status: 400 });
  const doc = {
    style: parseStyle(body?.doc?.style),
    editor: editorSettings(parseEditor(body?.doc?.editor)),
    look: body?.doc?.look && typeof body.doc.look === "object" ? body.doc.look : {},
  };
  const docJson = JSON.stringify(doc).slice(0, 100000);
  const row = await prisma.editorTemplate.create({ data: { userId, name, docJson } });
  return NextResponse.json({ template: { id: row.id, name: row.name, doc: safe(row.docJson) } });
}

function editorSettings(editor: ReturnType<typeof parseEditor>) {
  return { aspect: editor.aspect, fps: editor.fps, resolution: editor.resolution, background: editor.background };
}

function safe(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
