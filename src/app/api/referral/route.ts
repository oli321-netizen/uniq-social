import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req: req as any });
  const userId = (session?.user as { id?: string })?.id || token?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Generate referral code if user doesn't have one
  if (!user.referralCode) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    user = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });
  }

  // Count successful referrals
  const referralCount = await prisma.referral.count({
    where: { referrerId: userId, credited: true },
  });

  return NextResponse.json({
    code: user.referralCode,
    referralCount,
    creditsEarned: referralCount * 50,
  });
}

export async function POST(req: Request) {
  // Apply a referral code (called during signup)
  const { referralCode, userId } = await req.json();
  if (!referralCode || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const referrer = await prisma.user.findFirst({
    where: { referralCode: referralCode.toUpperCase() },
  });
  if (!referrer) return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
  if (referrer.id === userId) return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });

  // Check if already referred
  const existing = await prisma.referral.findUnique({ where: { referredId: userId } });
  if (existing) return NextResponse.json({ error: "Already referred" }, { status: 400 });

  // Create referral and credit both users
  await prisma.$transaction([
    prisma.referral.create({
      data: {
        code: referralCode.toUpperCase(),
        referrerId: referrer.id,
        referredId: userId,
        credited: true,
      },
    }),
    prisma.user.update({
      where: { id: referrer.id },
      data: { credits: { increment: 50 } },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: 50 } },
    }),
  ]);

  return NextResponse.json({ success: true, creditsAdded: 50 });
}
