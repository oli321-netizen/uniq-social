import { NextRequest, NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/session";
import { getJob, publicJob, replan } from "@/lib/ai-editor/jobs";
import type { ManualToggles } from "@/lib/ai-editor/plan";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "That render was not found." }, { status: 404 });
  return NextResponse.json({ job: publicJob(job) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const job = getJob(params.id, userId);
  if (!job) return NextResponse.json({ error: "That render was not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const toggles = body.toggles as ManualToggles;
  if (!toggles || typeof toggles !== "object") return NextResponse.json({ error: "Missing switches." }, { status: 400 });
  const next = await replan(job, toggles, String(body.prompt || ""));
  return NextResponse.json({ job: next });
}
