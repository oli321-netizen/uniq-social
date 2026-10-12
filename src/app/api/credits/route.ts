import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCredits, getUserPlan } from "@/lib/users";
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

  // Check for team credits and role
  let teamCredits = 0;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true, teamRole: true } });
  if (user?.teamId) {
    const team = await prisma.team.findUnique({ where: { id: user.teamId }, select: { credits: true } });
    teamCredits = team?.credits ?? 0;
  }

  return NextResponse.json({
    credits: await getCredits(userId),
    teamCredits,
    plan: await getUserPlan(userId),
    teamRole: user?.teamRole || null,
  });
}
