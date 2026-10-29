import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/session";
import { clipOutput, getJob } from "@/lib/ai-editor/jobs";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "The render is not ready." }, { status: 404 });
  const clipId = req.nextUrl.searchParams.get("clip");
  const clip = clipId ? (job.clips || []).find((item) => item.id === clipId && item.status === "done") : null;
  const filePath = clipId ? (clip ? clipOutput(job, clip.id) : "") : job.status === "done" ? job.outputPath : "";
  if (!filePath) return NextResponse.json({ error: "The render is not ready." }, { status: 404 });
  try {
    const info = await stat(filePath);
    const base = job.fileName.replace(/[^\w.\- ]+/g, "").replace(/\.mp4$/i, "").slice(0, 60) || "render";
    const name = clip ? `${base}-${clip.id}.mp4` : `${base}-ai.mp4`;
    const stream = createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(info.size),
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "The render file is missing." }, { status: 404 });
  }
}
