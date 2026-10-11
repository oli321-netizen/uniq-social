import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let userId: string | undefined;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    userId = (session.user as { id?: string }).id;
  }

  if (!userId) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod",
    });
    if (token?.id) {
      userId = token.id as string;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.plan === "free") {
    return NextResponse.json({ error: "Already on free plan" }, { status: 400 });
  }

  // If they have a Stripe subscription, they should use the billing portal
  if (user.stripeSubscriptionId) {
    return NextResponse.json({ error: "Use billing portal to manage Stripe subscriptions" }, { status: 400 });
  }

  // Downgrade to free (keep remaining credits)
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: "free",
    },
  });

  return NextResponse.json({ success: true });
}
