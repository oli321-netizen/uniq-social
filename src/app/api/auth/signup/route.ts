import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/users";
import { sendVerificationCode } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

    // Create 6-digit verification code (15 min expiry)
    const code = generateCode();
    await prisma.emailVerification.create({
      data: {
        token: code,
        userId: user.id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Send verification code email
    sendVerificationCode(user.email, code).catch((err) => {
      console.error("Failed to send verification code:", err);
    });

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
