import { NextRequest, NextResponse } from "next/server";
import { editorAccess } from "@/lib/ai-editor/access";
import { getJob, regenerateVariant } from "@/lib/ai-editor/jobs";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await editorAccess(userId);
  if (!access.allowed) return NextResponse.json({ error: "AI Editor needs an active plan." }, { status: 403 });
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "That edit was not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const index = Number(body.index);
  try {
    const next = await regenerateVariant(job, index);
    return NextResponse.json({ job: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not regenerate that edit.";
    const status = /credit/i.test(message) ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
