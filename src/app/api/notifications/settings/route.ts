import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const setting = await prisma.notificationSetting.findUnique({ where: { userId } });
  return NextResponse.json({
    emailEnabled: setting?.emailEnabled ?? true,
    inAppEnabled: setting?.inAppEnabled ?? true,
  });
}

export async function PUT(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const current = await prisma.notificationSetting.findUnique({ where: { userId } });
  const emailEnabled = body?.emailEnabled === undefined ? current?.emailEnabled ?? true : Boolean(body.emailEnabled);
  const inAppEnabled = body?.inAppEnabled === undefined ? current?.inAppEnabled ?? true : Boolean(body.inAppEnabled);
  const setting = await prisma.notificationSetting.upsert({
    where: { userId },
    create: { userId, emailEnabled, inAppEnabled },
    update: { emailEnabled, inAppEnabled },
  });
  return NextResponse.json({ emailEnabled: setting.emailEnabled, inAppEnabled: setting.inAppEnabled });
}
