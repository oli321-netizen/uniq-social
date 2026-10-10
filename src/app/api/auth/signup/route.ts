import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email";

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

    // Fire and forget — don't block signup on email delivery
    sendWelcomeEmail(user.email).catch(() => {});

    return NextResponse.json({
      id: user.id,
      email: user.email,
      credits: user.credits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
