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
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {}

  // Case 1: Pre-signup resend — email in body, no user exists yet (pending signup)
  if (body.email) {
    const normalised = body.email.toLowerCase().trim();

    // Check if this is a pending signup (verification record with no userId)
    const pending = await prisma.emailVerification.findFirst({
      where: { email: normalised, userId: null },
    });

    if (pending) {
      // Delete old codes and create a new one
      await prisma.emailVerification.deleteMany({
        where: { email: normalised, userId: null },
      });

      const code = generateCode();
      await prisma.emailVerification.create({
        data: {
          token: code,
          email: normalised,
          passwordHash: pending.passwordHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      await sendVerificationCode(normalised, code);
      return NextResponse.json({ success: true });
    }

    // Check if it's an existing user who needs re-verification
    const user = await prisma.user.findUnique({ where: { email: normalised } });
    if (user && !user.emailVerified) {
      await prisma.emailVerification.deleteMany({ where: { userId: user.id } });

      const code = generateCode();
      await prisma.emailVerification.create({
        data: {
          token: code,
          email: normalised,
          userId: user.id,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      await sendVerificationCode(normalised, code);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No pending verification found" }, { status: 400 });
  }

  // Case 2: Logged-in user resending from dashboard
  let userId: string | undefined;
  let userEmail: string | undefined;

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

  await prisma.emailVerification.deleteMany({ where: { userId } });

  const code = generateCode();
  await prisma.emailVerification.create({
    data: {
      token: code,
      email: user.email,
      userId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  await sendVerificationCode(user.email, code);
  return NextResponse.json({ success: true });
}
