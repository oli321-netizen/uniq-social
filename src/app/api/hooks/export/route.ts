import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { saveBytes, variantPath } from "@/lib/storage";
import { exportEdit } from "@/lib/hook-export";
import { clampSegments, parseWords } from "@/lib/edit-timeline";
import { parseStyle } from "@/lib/caption-ass";
import { readProject } from "@/lib/hook-project";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const projectId = String(body?.projectId || "");
  const existing = await prisma.hookProject.findFirst({ where: { id: projectId, userId } });
  if (!existing?.storageKey) return NextResponse.json({ error: "Upload a video first." }, { status: 404 });

  const words = parseWords(body?.words !== undefined ? body.words : JSON.parse(existing.wordsJson));
  const segments = clampSegments(
    Array.isArray(body?.segments) ? body.segments : JSON.parse(existing.segmentsJson),
    existing.durationSec
  );
  const style = parseStyle(body?.style !== undefined ? body.style : JSON.parse(existing.styleJson));
  if (words.length === 0) return NextResponse.json({ error: "There are no caption words to burn in." }, { status: 400 });
  if (segments.length === 0) return NextResponse.json({ error: "Keep at least one segment." }, { status: 400 });

  await prisma.hookProject.update({
    where: { id: existing.id },
    data: {
      wordsJson: JSON.stringify(words),
      segmentsJson: JSON.stringify(segments),
      styleJson: JSON.stringify(style),
    },
  });

  try {
    const mp4 = await exportEdit({ videoPath: existing.storageKey, words, segments, style });
    let variantId = "";
    if (body?.saveVariant) {
      const variant = await prisma.creativeVariant.create({
        data: {
          userId,
          creatorId: existing.creatorId,
          name: `${existing.fileName || "Export"} captions`.slice(0, 80),
          testsDimension: "captions",
          status: "ready",
          progress: 100,
          durationSec: segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0),
          hookText: words.slice(0, 12).map((word) => word.word).join(" ").slice(0, 180),
          batchKey: `export:${existing.id}:${Date.now()}`,
        },
      });
      const dest = variantPath(userId, variant.id);
      await saveBytes(dest, mp4);
      await prisma.creativeVariant.update({ where: { id: variant.id }, data: { storageKey: dest } });
      variantId = variant.id;
    }
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${(existing.fileName || "hook-lab").replace(/"/g, "")}-captions.mp4"`,
      "Cache-Control": "no-store",
    });
    if (variantId) headers.set("X-Variant-Id", variantId);
    return new NextResponse(new Uint8Array(mp4), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    return NextResponse.json({ error: message, project: readProject(existing) }, { status: 500 });
  }
}
