import path from "path";
import { access } from "fs/promises";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { assetPath, saveBytes, storageRoot, variantPath } from "@/lib/storage";
import { exportEdit } from "@/lib/hook-export";
import { clampSegments, composedDuration, parseWords, type Segment } from "@/lib/edit-timeline";
import { parseStyle } from "@/lib/caption-ass";
import { parseCues } from "@/lib/caption-cues";
import { parseEditor, type EditorDoc } from "@/lib/editor-doc";
import { hasAudio } from "@/lib/transcribe";
import type { ComposeAsset } from "@/lib/compose-export";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const projectId = String(body?.projectId || "");
  const existing = await prisma.hookProject.findFirst({ where: { id: projectId, userId } });
  if (!existing?.storageKey) return Response.json({ error: "Upload a video first." }, { status: 404 });

  const storedStyle = safeJson(existing.styleJson) as { cues?: unknown; editor?: unknown } | null;
  const words = parseWords(body?.words !== undefined ? body.words : safeJson(existing.wordsJson));
  const segments = clampSegments(
    Array.isArray(body?.segments) ? body.segments : safeJson(existing.segmentsJson),
    existing.durationSec
  );
  const style = parseStyle(body?.style !== undefined ? body.style : storedStyle);
  const cues = parseCues(body?.cues !== undefined ? body.cues : storedStyle?.cues);
  const editor = parseEditor(body?.editor !== undefined ? body.editor : storedStyle?.editor);
  if (words.length === 0) return Response.json({ error: "There are no caption words to burn in." }, { status: 400 });
  if (segments.length === 0) return Response.json({ error: "Keep at least one segment." }, { status: 400 });
  let assets: ComposeAsset[] = [];
  try {
    assets = await resolveAssets(userId, existing.id, editor, segments);
  } catch (error) {
    const message = error instanceof Error ? error.message : "An imported file is missing.";
    return Response.json({ error: message }, { status: 400 });
  }

  await prisma.hookProject.update({
    where: { id: existing.id },
    data: {
      wordsJson: JSON.stringify(words),
      segmentsJson: JSON.stringify(segments),
      styleJson: JSON.stringify({ ...style, cues, editor }),
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
          editor,
          assets,
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

async function resolveAssets(userId: string, projectId: string, editor: EditorDoc, segments: Segment[]) {
  const needed = new Set<string>();
  for (const seg of segments) if (seg.assetId) needed.add(seg.assetId);
  for (const layer of editor.overlays) needed.add(layer.assetId);
  for (const layer of editor.audios) needed.add(layer.assetId);
  const files: ComposeAsset[] = [];
  for (const asset of editor.assets) {
    if (!needed.has(asset.id)) continue;
    const file = assetPath(userId, projectId, asset.id, asset.ext);
    try {
      await access(file);
    } catch {
      throw new Error(`Imported file ${asset.name} is missing. Import it again.`);
    }
    const audio = asset.kind === "image" ? false : asset.kind === "audio" ? true : await hasAudio(file);
    files.push({ id: asset.id, path: file, kind: asset.kind, duration: asset.duration, audio });
  }
  for (const id of Array.from(needed)) {
    if (!files.some((file) => file.id === id)) throw new Error("An imported clip is missing from this project.");
  }
  return files;
}

function insideStorage(filePath: string) {
  const root = path.resolve(storageRoot());
  const file = path.resolve(filePath);
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
