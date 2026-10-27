import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/session";
import { scanCredits } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  await scanCredits(userId).catch(() => {});
  const setting = await prisma.notificationSetting.findUnique({ where: { userId } });
  const emailEnabled = setting?.emailEnabled ?? true;
  const inAppEnabled = setting?.inAppEnabled ?? true;
  if (!inAppEnabled) {
    return NextResponse.json({ notifications: [], unread: 0, emailEnabled, inAppEnabled });
  }
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return NextResponse.json({
    notifications: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      read: Boolean(row.readAt),
      createdAt: row.createdAt.toISOString(),
    })),
    unread: rows.filter((row) => !row.readAt).length,
    emailEnabled,
    inAppEnabled,
  });
}
