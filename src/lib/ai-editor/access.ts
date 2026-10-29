import { paidAccess } from "@/lib/plan-access";

export type EditorAccess = {
  allowed: boolean;
  plan: string;
  label: string;
  credits: number;
  teamCredits: number;
};

export async function editorAccess(userId: string): Promise<EditorAccess> {
  const access = await paidAccess(userId);
  return {
    allowed: access.allowed,
    plan: access.plan,
    label: access.label,
    credits: access.credits,
    teamCredits: access.teamCredits,
  };
}

export function canPay(credits: number, teamCredits: number, cost: number) {
  return credits >= cost || teamCredits >= cost;
}
