import { prisma } from "@/lib/prisma";

export type NotifyKind = "batch_finished" | "approval_needed" | "post_due" | "credits_low" | "winner_found";

export async function notifyUser(
  userId: string,
  input: { kind: NotifyKind; title: string; body?: string; href?: string; ref?: string }
) {
  const ref = (input.ref || "").slice(0, 160);
  if (ref) {
    const existing = await prisma.notification.findFirst({ where: { userId, ref, readAt: null } });
    if (existing) return existing;
  }
  const row = await prisma.notification.create({
    data: {
      userId,
      kind: input.kind,
      title: input.title.slice(0, 160),
      body: (input.body || "").slice(0, 500),
      href: (input.href || "/hub").slice(0, 300),
      ref,
    },
  });
  await maybeEmail(userId, row.title, row.body, row.href);
  return row;
}

async function maybeEmail(userId: string, title: string, body: string, href: string) {
  try {
    const setting = await prisma.notificationSetting.findUnique({ where: { userId } });
    if (setting && setting.emailEnabled === false) return;
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) return;
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    const from = process.env.RESEND_FROM_EMAIL || "UniqSocial <noreply@uniqsocial.com>";
    const origin = process.env.NEXTAUTH_URL || "";
    await resend.emails.send({
      from,
      to: user.email,
      subject: title,
      text: `${body}\n${origin}${href}`.trim(),
    });
  } catch (error) {
    console.error("Notification email failed:", error);
  }
}

export async function scanCredits(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user || user.credits >= 10) return;
  await notifyUser(userId, {
    kind: "credits_low",
    title: "Credits are low",
    body: `${user.credits} credits left. Each render uses 1 credit and is not refunded if it fails.`,
    href: "/dashboard",
    ref: "credits-low",
  });
}

export async function notifyBatch(userId: string, variantIds: string[]) {
  if (variantIds.length === 0) return;
  const newest = variantIds[variantIds.length - 1];
  await notifyUser(userId, {
    kind: "batch_finished",
    title: "Batch finished",
    body: `${variantIds.length} variant${variantIds.length === 1 ? "" : "s"} finished this run.`,
    href: "/hub/variants",
    ref: `batch:${newest}`,
  });
  await scanCredits(userId);
}

export async function notifyWinner(userId: string, variantId: string, name: string) {
  const rows = await prisma.variantResult.groupBy({
    by: ["variantId"],
    where: { userId },
    _sum: { views: true },
  });
  const mine = rows.find((row) => row.variantId === variantId)?._sum.views || 0;
  const others = rows.filter((row) => row.variantId !== variantId).map((row) => row._sum.views || 0);
  const bestOther = others.length ? Math.max(...others) : 0;
  if (mine > bestOther && mine > 0) {
    await notifyUser(userId, {
      kind: "winner_found",
      title: "Winner found",
      body: `${name} leads on logged views (${mine.toLocaleString()}).`,
      href: "/hub/results",
      ref: `winner:${variantId}`,
    });
  }
}
