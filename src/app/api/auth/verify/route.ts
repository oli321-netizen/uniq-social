import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { code, email } = await req.json();

    if (!code || !email) {
      return NextResponse.json({ error: "Code and email are required" }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ alreadyVerified: true, email: user.email });
    }

    // Find matching verification code for this user
    const verification = await prisma.emailVerification.findFirst({
      where: { userId: user.id, token: code },
    });

    if (!verification) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    if (verification.expiresAt < new Date()) {
      await prisma.emailVerification.delete({ where: { id: verification.id } });
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    // Clean up all verification tokens for this user
    await prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    // Send welcome email
    sendWelcomeEmail(user.email).catch(() => {});

    return NextResponse.json({
      success: true,
      email: user.email,
    });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
