import { prisma } from "@/lib/prisma";
import { PAID_PLANS } from "@/lib/plan-access";
import { SUBSCRIPTION_PLANS } from "@/lib/stripe";

export function planByKey(planKey: string) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.key === planKey) || null;
}

export function codesFromEnv() {
  const map = new Map<string, string>();
  const raw = process.env.PROMO_CODES || "";
  for (const part of raw.split(",")) {
    const pieces = part.split(":");
    const code = (pieces[0] || "").trim().toUpperCase();
    const plan = (pieces[1] || "").trim().toLowerCase();
    if (!code || !PAID_PLANS.includes(plan as (typeof PAID_PLANS)[number])) continue;
    map.set(code, plan);
  }
  return map;
}

/** Same plan write the Stripe webhook uses. Stripe calls skip a second grant for the same subscription. */
export async function activatePlan(userId: string, input: {
  planKey: string;
  credits: number;
  subscriptionId?: string | null;
  priceId?: string | null;
  periodEnd?: Date | null;
  source: "stripe" | "code";
  code?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (input.source === "stripe" && input.subscriptionId && user.stripeSubscriptionId === input.subscriptionId && user.plan === input.planKey && user.subscriptionStatus === "active") {
    return { plan: user.plan, credits: user.credits, already: true };
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      plan: input.planKey,
      subscriptionStatus: "active",
      ...(input.subscriptionId
        ? {
            stripeSubscriptionId: input.subscriptionId,
            stripePriceId: input.priceId ?? null,
            currentPeriodEnd: input.periodEnd ?? null,
          }
        : {}),
      credits: { increment: input.credits },
    },
  });
  await prisma.transaction.create({
    data: {
      userId,
      type: input.source === "code" ? "plan_code" : "subscription",
      description: input.source === "code" ? input.code || input.planKey : `Plan ${input.planKey}`,
      credits: input.credits,
    },
  });
  console.info("[billing] plan activated", { userId, plan: input.planKey, source: input.source, already: false });
  return { plan: updated.plan, credits: updated.credits, already: false };
}
