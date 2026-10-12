import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  let userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    const token = await getToken({ req });
    userId = token?.sub;
  }
  return userId || null;
}

// GET — get pending invites for the current user
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const invites = await prisma.teamInvite.findMany({
    where: { email: user.email, status: "pending" },
    include: {
      team: { select: { id: true, name: true, credits: true, _count: { select: { members: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites });
}
