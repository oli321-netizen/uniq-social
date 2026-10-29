import { prisma } from "@/lib/prisma";
import { PLAN_DETAILS, type PlanName } from "@/lib/users";

export const PAID_PLANS = ["starter", "growth", "pro", "business", "agency"] as const;

export type PaidAccess = {
  allowed: boolean;
  plan: string;
  label: string;
  credits: number;
  teamCredits: number;
};

/** One check for AI Editor, Editor Lab, and any other paid-only surface. */
export async function paidAccess(userId: string): Promise<PaidAccess> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, plan: "free", label: "Free", credits: 0, teamCredits: 0 };
  let teamCredits = 0;
  if (user.teamId) {
    const team = await prisma.team.findUnique({ where: { id: user.teamId } });
    teamCredits = team?.credits ?? 0;
  }
  if (planOpen(user.plan, user.subscriptionStatus)) {
    return { allowed: true, plan: user.plan, label: labelOf(user.plan), credits: user.credits, teamCredits };
  }
  if (user.teamId) {
    const owner = await prisma.user.findFirst({ where: { teamId: user.teamId, teamRole: "owner" } });
    if (owner && planOpen(owner.plan, owner.subscriptionStatus)) {
      return { allowed: true, plan: owner.plan, label: labelOf(owner.plan), credits: user.credits, teamCredits };
    }
  }
  return { allowed: false, plan: user.plan || "free", label: labelOf(user.plan), credits: user.credits, teamCredits };
}

export function planOpen(plan: string | null | undefined, status: string | null | undefined) {
  if (!plan || !PAID_PLANS.includes(plan as (typeof PAID_PLANS)[number])) return false;
  if (!status) return true;
  return status === "active" || status === "trialing";
}

export function labelOf(plan: string | null | undefined) {
  if (plan && plan in PLAN_DETAILS) return PLAN_DETAILS[plan as PlanName].label;
  return "Free";
}
