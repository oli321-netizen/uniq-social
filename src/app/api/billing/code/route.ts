import { NextRequest, NextResponse } from "next/server";
import { activatePlan, codesFromEnv, planByKey } from "@/lib/billing";
import { labelOf } from "@/lib/plan-access";
import { unlockedLines } from "@/lib/plan-catalog";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireUserId, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const limit = rateLimit(`plan-code:${userId}`, 10 * 60 * 1000, 5);
  if (!limit.ok) return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code || "").trim().toUpperCase();
  if (!code || code.length > 64) return NextResponse.json({ error: "That code is not valid." }, { status: 400 });

  const planKey = codesFromEnv().get(code);
  if (!planKey) return NextResponse.json({ error: "That code is not valid." }, { status: 400 });
  const plan = planByKey(planKey);
  if (!plan) return NextResponse.json({ error: "That code is not valid." }, { status: 400 });

  const prior = await prisma.transaction.findFirst({
    where: { userId, type: "plan_code", description: code },
  });
  if (prior) return NextResponse.json({ error: "That code was already used on this account." }, { status: 400 });

  const result = await activatePlan(userId, {
    planKey,
    credits: plan.credits,
    source: "code",
    code,
  });
  return NextResponse.json({
    success: true,
    plan: result.plan,
    label: labelOf(result.plan),
    credits: result.credits,
    unlocked: unlockedLines(result.plan),
  });
}
