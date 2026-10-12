import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTeamInviteEmail } from "@/lib/email";

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  let userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    const token = await getToken({ req });
    userId = token?.sub;
  }
  return userId || null;
}

// GET — get current user's team info
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true, teamRole: true },
  });

  if (!user?.teamId) {
    return NextResponse.json({ team: null });
  }

  const team = await prisma.team.findUnique({
    where: { id: user.teamId },
    include: {
      members: {
        select: { id: true, email: true, teamRole: true, credits: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      invites: {
        where: { status: "pending" },
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ team, role: user.teamRole });
}

// POST — create a team OR invite a member
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    return createTeam(userId, body);
  } else if (action === "invite") {
    return inviteMember(userId, body);
  } else if (action === "accept") {
    return acceptInvite(userId, body);
  } else if (action === "decline") {
    return declineInvite(userId, body);
  } else if (action === "add-credits") {
    return addTeamCredits(userId, body);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE — remove a member or leave team
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "remove-member") {
    return removeMember(userId, body);
  } else if (action === "leave") {
    return leaveTeam(userId);
  } else if (action === "cancel-invite") {
    return cancelInvite(userId, body);
  } else if (action === "disband") {
    return disbandTeam(userId);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

async function createTeam(userId: string, body: { name?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.teamId) return NextResponse.json({ error: "You are already on a team" }, { status: 400 });

  const name = body.name?.trim();
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Team name must be at least 2 characters" }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      name,
      ownerId: userId,
      credits: 0,
      members: { connect: { id: userId } },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { teamRole: "owner" },
  });

  return NextResponse.json({ team });
}

async function inviteMember(userId: string, body: { email?: string; credits?: number }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.teamId || user.teamRole !== "owner") {
    return NextResponse.json({ error: "Only team owners can invite members" }, { status: 403 });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (email === user.email) return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });

  // Check if already on this team
  const existingMember = await prisma.user.findFirst({
    where: { email, teamId: user.teamId },
  });
  if (existingMember) {
    return NextResponse.json({ error: "This user is already on your team" }, { status: 400 });
  }

  // Check for existing pending invite
  const existingInvite = await prisma.teamInvite.findUnique({
    where: { email_teamId: { email, teamId: user.teamId } },
  });
  if (existingInvite && existingInvite.status === "pending") {
    return NextResponse.json({ error: "An invite is already pending for this email" }, { status: 400 });
  }

  // Max 10 members per team
  const memberCount = await prisma.user.count({ where: { teamId: user.teamId } });
  if (memberCount >= 10) {
    return NextResponse.json({ error: "Maximum 10 team members allowed" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: user.teamId } });
  const inviteCredits = Math.max(0, Math.floor(body.credits || 0));

  // Create or update invite
  let inviteRecord;
  if (existingInvite) {
    inviteRecord = await prisma.teamInvite.update({
      where: { id: existingInvite.id },
      data: { status: "pending", credits: inviteCredits, createdAt: new Date() },
    });
  } else {
    inviteRecord = await prisma.teamInvite.create({
      data: { email, teamId: user.teamId, credits: inviteCredits },
    });
  }

  // Send email notification with invite link
  try {
    await sendTeamInviteEmail(email, team?.name || "Team", user.email, inviteRecord.id);
  } catch {}

  return NextResponse.json({ success: true });
}

async function acceptInvite(userId: string, body: { inviteId?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.teamId) return NextResponse.json({ error: "You are already on a team. Leave first." }, { status: 400 });

  const invite = await prisma.teamInvite.findFirst({
    where: { id: body.inviteId, email: user.email, status: "pending" },
  });
  if (!invite) return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });

  await prisma.$transaction([
    prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { teamId: invite.teamId, teamRole: "member" },
    }),
  ]);

  return NextResponse.json({ success: true });
}

async function declineInvite(userId: string, body: { inviteId?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const invite = await prisma.teamInvite.findFirst({
    where: { id: body.inviteId, email: user.email, status: "pending" },
  });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  await prisma.teamInvite.update({
    where: { id: invite.id },
    data: { status: "declined" },
  });

  return NextResponse.json({ success: true });
}

async function addTeamCredits(userId: string, body: { credits?: number }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.teamId || user.teamRole !== "owner") {
    return NextResponse.json({ error: "Only team owners can add credits" }, { status: 403 });
  }

  const credits = body.credits;
  if (!credits || credits <= 0) {
    return NextResponse.json({ error: "Invalid credit amount" }, { status: 400 });
  }

  // Move credits from owner's balance to team pool
  if (user.credits < credits) {
    return NextResponse.json({ error: "Insufficient personal credits" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: credits } },
    }),
    prisma.team.update({
      where: { id: user.teamId },
      data: { credits: { increment: credits } },
    }),
  ]);

  return NextResponse.json({ success: true });
}

async function removeMember(userId: string, body: { memberId?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.teamId || user.teamRole !== "owner") {
    return NextResponse.json({ error: "Only team owners can remove members" }, { status: 403 });
  }

  if (body.memberId === userId) {
    return NextResponse.json({ error: "Cannot remove yourself. Use disband instead." }, { status: 400 });
  }

  const member = await prisma.user.findFirst({
    where: { id: body.memberId, teamId: user.teamId },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: member.id },
    data: { teamId: null, teamRole: null },
  });

  return NextResponse.json({ success: true });
}

async function leaveTeam(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.teamId) return NextResponse.json({ error: "Not on a team" }, { status: 400 });
  if (user.teamRole === "owner") {
    return NextResponse.json({ error: "Owners must disband the team or transfer ownership first" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { teamId: null, teamRole: null },
  });

  return NextResponse.json({ success: true });
}

async function cancelInvite(userId: string, body: { inviteId?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.teamId || user.teamRole !== "owner") {
    return NextResponse.json({ error: "Only team owners can cancel invites" }, { status: 403 });
  }

  const invite = await prisma.teamInvite.findFirst({
    where: { id: body.inviteId, teamId: user.teamId, status: "pending" },
  });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  await prisma.teamInvite.delete({ where: { id: invite.id } });

  return NextResponse.json({ success: true });
}

async function disbandTeam(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.teamId || user.teamRole !== "owner") {
    return NextResponse.json({ error: "Only team owners can disband" }, { status: 403 });
  }

  const team = await prisma.team.findUnique({ where: { id: user.teamId } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Return team credits to owner
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { teamId: team.id },
      data: { teamId: null, teamRole: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: team.credits } },
    }),
    prisma.team.delete({ where: { id: team.id } }),
  ]);

  return NextResponse.json({ success: true });
}
