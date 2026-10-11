import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode } from "@/lib/email";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  let userId: string | undefined;
  let userEmail: string | undefined;

  // Try to get user from session or JWT
  const session = await getServerSession(authOptions);
  if (session?.user) {
    userId = (session.user as { id?: string }).id;
    userEmail = session.user.email ?? undefined;
  }

  if (!userId) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod",
    });
    if (token?.id) {
      userId = token.id as string;
      userEmail = token.email ?? undefined;
    }
  }

  // Also accept email in body (for pre-login resend from signup screen)
  if (!userId) {
    try {
      const body = await req.json();
      if (body.email) {
        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (user) {
          userId = user.id;
          userEmail = user.email;
        }
      }
    } catch {}
  }

  if (!userId || !userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "Email already verified" }, { status: 400 });
  }

  // Delete old tokens
  await prisma.emailVerification.deleteMany({ where: { userId } });

  // Create new 6-digit code (15 min expiry)
  const code = generateCode();
  await prisma.emailVerification.create({
    data: {
      token: code,
      userId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  await sendVerificationCode(user.email, code);

  return NextResponse.json({ success: true });
}
