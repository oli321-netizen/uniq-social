import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { redeemPromoCode } from "@/lib/users";

export async function POST(req: NextRequest) {
  // Try getServerSession first, fall back to JWT token
  let userId: string | undefined;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    userId = (session.user as { id?: string }).id;
  }

  // Fallback: read from JWT directly
  if (!userId) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod" });
    if (token?.id) {
      userId = token.id as string;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { code } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  const result = await redeemPromoCode(userId, code);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    plan: result.plan,
    creditsAdded: result.creditsAdded,
  });
}
