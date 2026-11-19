import { NextResponse } from "next/server";
import { editorAccess } from "@/lib/ai-editor/access";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await editorAccess(userId);
  return NextResponse.json({ access });
}
