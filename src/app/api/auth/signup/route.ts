import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode } from "@/lib/email";
import bcrypt from "bcryptjs";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 signups per hour per IP
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`signup:${ip}`, 3600000, 5);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  try {
    const { email, password, referralCode } = await req.json();

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

    const normalised = email.toLowerCase().trim();

    // Check if email is already taken
    const existing = await prisma.user.findUnique({ where: { email: normalised } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    // Hash password for temporary storage
    const passwordHash = await bcrypt.hash(password, 12);

    // Clean up any previous pending signups for this email
    await prisma.emailVerification.deleteMany({
      where: { email: normalised, userId: null },
    });

    // Create verification code (15 min expiry) — no user created yet
    const code = generateCode();
    await prisma.emailVerification.create({
      data: {
        token: code,
        email: normalised,
        passwordHash,
        referralCode: referralCode?.trim() || null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Send verification code email
    sendVerificationCode(normalised, code).catch((err) => {
      console.error("Failed to send verification code:", err);
    });

    return NextResponse.json({
      email: normalised,
      needsVerification: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
