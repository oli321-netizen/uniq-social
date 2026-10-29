import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { paidAccess } from "@/lib/plan-access";

export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Auth plus the shared paid-plan check. Returns a response when the caller should stop. */
export async function requirePaidUserId(): Promise<string | NextResponse> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const access = await paidAccess(userId);
  if (!access.allowed) return NextResponse.json({ error: "This needs a paid plan." }, { status: 403 });
  return userId;
}
