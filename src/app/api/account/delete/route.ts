import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    let userId = (session?.user as { id?: string })?.id;

    if (!userId) {
      const token = await getToken({ req });
      userId = token?.sub;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await req.json();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required to delete your account" },
        { status: 400 }
      );
    }

    // Verify user exists and password matches
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 403 }
      );
    }

    // Cancel any active Stripe subscription
    if (user.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (e) {
        console.error("Failed to cancel subscription:", e);
        // Continue with deletion even if subscription cancel fails
      }
    }

    // Delete user — cascading deletes handle related records
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
