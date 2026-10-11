import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  return NextResponse.json({
    credits: user?.credits ?? 0,
    plan: user?.plan ?? "free",
    hasSubscription: !!user?.stripeSubscriptionId,
  });
}
