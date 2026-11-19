import { NextRequest, NextResponse } from "next/server";
import { activatePlan, planByKey } from "@/lib/billing";
import { labelOf } from "@/lib/plan-access";
import { unlockedLines } from "@/lib/plan-catalog";
import { requireUserId, unauthorized } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "");
  if (!sessionId.startsWith("cs_")) return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.userId !== userId) return NextResponse.json({ error: "That checkout is for a different account." }, { status: 403 });
  if (session.status !== "complete") return NextResponse.json({ error: "Checkout is not complete yet." }, { status: 409 });

  if (session.mode === "subscription") {
    const planKey = String(session.metadata?.planKey || "");
    const plan = planByKey(planKey);
    if (!plan) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    let priceId: string | null = null;
    let periodEnd: Date | null = null;
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      priceId = sub.items.data[0]?.price?.id || null;
      const end = (sub as unknown as { current_period_end?: number }).current_period_end;
      if (end) periodEnd = new Date(end * 1000);
    }
    const result = await activatePlan(userId, {
      planKey,
      credits: plan.credits,
      subscriptionId,
      priceId,
      periodEnd,
      source: "stripe",
    });
    return NextResponse.json({
      plan: result.plan,
      label: labelOf(result.plan),
      credits: result.credits,
      unlocked: unlockedLines(result.plan),
      already: result.already,
    });
  }

  return NextResponse.json({ plan: null, topUp: true });
}
