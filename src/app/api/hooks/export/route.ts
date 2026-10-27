import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { saveBytes, storageRoot, variantPath } from "@/lib/storage";
import { exportEdit } from "@/lib/hook-export";
import { clampSegments, composedDuration, parseWords } from "@/lib/edit-timeline";
import { parseStyle } from "@/lib/caption-ass";
import { parseCues } from "@/lib/caption-cues";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const projectId = String(body?.projectId || "");
  const existing = await prisma.hookProject.findFirst({ where: { id: projectId, userId } });
  if (!existing?.storageKey) return Response.json({ error: "Upload a video first." }, { status: 404 });

  const storedStyle = safeJson(existing.styleJson) as { cues?: unknown } | null;
  const words = parseWords(body?.words !== undefined ? body.words : safeJson(existing.wordsJson));
  const segments = clampSegments(
    Array.isArray(body?.segments) ? body.segments : safeJson(existing.segmentsJson),
    existing.durationSec
  );
  const style = parseStyle(body?.style !== undefined ? body.style : storedStyle);
  const cues = parseCues(body?.cues !== undefined ? body.cues : storedStyle?.cues);
  if (words.length === 0) return Response.json({ error: "There are no caption words to burn in." }, { status: 400 });
  if (segments.length === 0) return Response.json({ error: "Keep at least one segment." }, { status: 400 });

  await prisma.hookProject.update({
    where: { id: existing.id },
    data: {
      wordsJson: JSON.stringify(words),
      segmentsJson: JSON.stringify(segments),
      styleJson: JSON.stringify({ ...style, cues }),
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        const mp4 = await exportEdit({
          videoPath: existing.storageKey,
          words,
          segments,
          style,
          cues,
          onProgress: (progress) => send({ progress }),
        });
        const exportPath = path.join(path.dirname(existing.storageKey), `${existing.id}-export.mp4`);
        if (!insideStorage(exportPath)) throw new Error("Could not store the export.");
        await saveBytes(exportPath, mp4);
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
              durationSec: composedDuration(segments),
              hookText: words.slice(0, 12).map((word) => word.word).join(" ").slice(0, 180),
              batchKey: `export:${existing.id}:${Date.now()}`,
            },
          });
          const dest = variantPath(userId, variant.id);
          await saveBytes(dest, mp4);
          await prisma.creativeVariant.update({ where: { id: variant.id }, data: { storageKey: dest } });
          variantId = variant.id;
        }
        send({
          progress: 1,
          download: `/api/hooks/projects/${existing.id}/export-file`,
          variantId: variantId || null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Export failed.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeJson(raw: unknown) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function insideStorage(filePath: string) {
  const root = path.resolve(storageRoot());
  const file = path.resolve(filePath);
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
