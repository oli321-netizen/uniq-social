import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`forgot:${ip}`, 3600000, 5);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalised = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalised } });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Create a new reset token (expires in 1 hour)
    const token = randomUUID();
    await prisma.passwordReset.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Send the reset email
    await sendPasswordResetEmail(normalised, token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    // Still return success to prevent enumeration
    return NextResponse.json({ success: true });
  }
}
