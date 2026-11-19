import { NextRequest, NextResponse } from "next/server";
import { editorAccess } from "@/lib/ai-editor/access";
import { getJob, publicJob } from "@/lib/ai-editor/jobs";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await editorAccess(userId);
  if (!access.allowed) return NextResponse.json({ error: "AI Editor needs an active plan." }, { status: 403 });
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "That edit was not found." }, { status: 404 });
  return NextResponse.json({ job: publicJob(job) });
}
