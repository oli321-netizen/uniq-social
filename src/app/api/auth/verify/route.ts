import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const verification = await prisma.emailVerification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    if (verification.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.emailVerification.delete({ where: { id: verification.id } });
      return NextResponse.json({ error: "This link has expired. Please sign up again." }, { status: 400 });
    }

    if (verification.user.emailVerified) {
      return NextResponse.json({ alreadyVerified: true, email: verification.user.email });
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerified: true },
    });

    // Clean up all verification tokens for this user
    await prisma.emailVerification.deleteMany({
      where: { userId: verification.userId },
    });

    // Send welcome email now that they're verified
    sendWelcomeEmail(verification.user.email).catch(() => {});

    return NextResponse.json({
      success: true,
      email: verification.user.email,
    });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
