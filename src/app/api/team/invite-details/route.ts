import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — no auth required
// Returns invite details so the invite landing page can display them
export async function GET(req: NextRequest) {
  const inviteId = req.nextUrl.searchParams.get("id");
  if (!inviteId) {
    return NextResponse.json({ error: "Missing invite ID" }, { status: 400 });
  }

  const invite = await prisma.teamInvite.findUnique({
    where: { id: inviteId },
    include: {
      team: {
        select: {
          name: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "This invite has already been used" }, { status: 400 });
  }

  return NextResponse.json({
    id: invite.id,
    email: invite.email,
    teamName: invite.team.name,
    memberCount: invite.team._count.members,
    credits: invite.credits,
  });
}
