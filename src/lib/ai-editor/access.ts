import { prisma } from "@/lib/prisma";
import type { PlanName } from "@/lib/users";
import { PLAN_DETAILS } from "@/lib/users";

const PAID: PlanName[] = ["starter", "growth", "pro", "business", "agency"];

export type EditorAccess = {
  allowed: boolean;
  plan: string;
  label: string;
  credits: number;
  teamCredits: number;
};

export async function editorAccess(userId: string): Promise<EditorAccess> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, plan: "free", label: "Free", credits: 0, teamCredits: 0 };
  let teamCredits = 0;
  if (user.teamId) {
    const team = await prisma.team.findUnique({ where: { id: user.teamId } });
    teamCredits = team?.credits ?? 0;
  }
  const own = planOpen(user.plan, user.subscriptionStatus);
  if (own) {
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

function planOpen(plan: string, status: string | null) {
  if (!PAID.includes(plan as PlanName)) return false;
  if (!status) return true;
  return status === "active" || status === "trialing";
}

function labelOf(plan: string) {
  if (plan in PLAN_DETAILS) return PLAN_DETAILS[plan as PlanName].label;
  return "Free";
}

export function canPay(credits: number, teamCredits: number, cost: number) {
  return credits >= cost || teamCredits >= cost;
}
