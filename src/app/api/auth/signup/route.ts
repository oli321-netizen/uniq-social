import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/users";
import { sendVerificationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await createUser(email, password);

    // Create verification token (24h expiry)
    const token = randomUUID();
    await prisma.emailVerification.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Send verification email (fire and forget)
    sendVerificationEmail(user.email, token).catch(() => {});

    return NextResponse.json({
      id: user.id,
      email: user.email,
      credits: user.credits,
      needsVerification: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
