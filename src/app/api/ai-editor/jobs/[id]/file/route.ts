import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { editorAccess } from "@/lib/ai-editor/access";
import { getJob, variantFile } from "@/lib/ai-editor/jobs";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await editorAccess(userId);
  if (!access.allowed) return NextResponse.json({ error: "AI Editor needs an active plan." }, { status: 403 });
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "That edit was not found." }, { status: 404 });
  const index = Number(req.nextUrl.searchParams.get("variant"));
  const variant = job.variants.find((item) => item.index === index && item.status === "done");
  const filePath = variant ? variantFile(job, variant.index) : "";
  if (!filePath) return NextResponse.json({ error: "That edit is not ready." }, { status: 404 });
  try {
    const info = await stat(filePath);
    const base = job.fileName.replace(/[^\w.\- ]+/g, "").replace(/\.mp4$/i, "").slice(0, 40) || "edit";
    const stream = createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(info.size),
        "Content-Disposition": `inline; filename="${base}-${index + 1}.mp4"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "That file is missing." }, { status: 404 });
  }
}
