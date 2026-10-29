import { NextRequest, NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/session";
import { getJob, startRender } from "@/lib/ai-editor/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "That render was not found." }, { status: 404 });
  if (job.status === "transcribing" || job.status === "queued" || job.status === "rendering") {
    return NextResponse.json({ error: "This video is still working." }, { status: 409 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const next = await startRender(job, body.plan || job.plan, body);
    return NextResponse.json({ job: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render.";
    const status = message.includes("credits") ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
