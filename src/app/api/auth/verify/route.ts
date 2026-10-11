import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { code, email } = await req.json();

    if (!code || !email) {
      return NextResponse.json({ error: "Code and email are required" }, { status: 400 });
    }

    const normalised = email.toLowerCase().trim();

    // Find the pending signup verification (no userId = pending signup)
    const verification = await prisma.emailVerification.findFirst({
      where: { email: normalised, token: code, userId: null },
    });

    if (!verification) {
      // Also check if this is an existing user re-verifying (dashboard flow)
      const user = await prisma.user.findUnique({ where: { email: normalised } });
      if (user) {
        const userVerification = await prisma.emailVerification.findFirst({
          where: { userId: user.id, token: code },
        });

        if (!userVerification) {
          return NextResponse.json({ error: "Invalid code" }, { status: 400 });
        }

        if (userVerification.expiresAt < new Date()) {
          await prisma.emailVerification.delete({ where: { id: userVerification.id } });
          return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
        }

        // Mark existing user as verified
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
        await prisma.emailVerification.deleteMany({ where: { userId: user.id } });

        return NextResponse.json({ success: true, email: user.email });
      }

      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Check expiry
    if (verification.expiresAt < new Date()) {
      await prisma.emailVerification.delete({ where: { id: verification.id } });
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }

    // Check email isn't taken (race condition guard)
    const existingUser = await prisma.user.findUnique({ where: { email: normalised } });
    if (existingUser) {
      await prisma.emailVerification.delete({ where: { id: verification.id } });
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    // Create the user account now that email is verified
    const user = await prisma.user.create({
      data: {
        email: normalised,
        password: verification.passwordHash!,
        emailVerified: true,
        credits: 5,
        plan: "free",
      },
    });

    // Apply referral code if provided during signup
    if (verification.referralCode) {
      const referral = await prisma.referral.findUnique({
        where: { code: verification.referralCode },
      });
      if (referral && !referral.referredId) {
        await prisma.$transaction([
          prisma.referral.update({
            where: { id: referral.id },
            data: { referredId: user.id, credited: true },
          }),
          prisma.user.update({
            where: { id: referral.referrerId },
            data: { credits: { increment: 50 } },
          }),
          prisma.user.update({
            where: { id: user.id },
            data: { credits: { increment: 50 } },
          }),
        ]);
      }
    }

    // Clean up verification record
    await prisma.emailVerification.deleteMany({
      where: { email: normalised, userId: null },
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
