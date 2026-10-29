import { NextRequest, NextResponse } from "next/server";
import { editorAccess } from "@/lib/ai-editor/access";
import { searchTracks } from "@/lib/ai-editor/music";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await editorAccess(userId);
  if (!access.allowed) return NextResponse.json({ error: "AI Editor needs an active plan." }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q") || "";
  const result = await searchTracks(q);
  return NextResponse.json(result);
}
