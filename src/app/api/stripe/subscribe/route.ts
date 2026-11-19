import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { stripe, SUBSCRIPTION_PLANS, getOrCreatePrice } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // Auth check — session first, JWT fallback
  let userId: string | undefined;
  let userEmail: string | undefined;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    userId = (session.user as { id?: string }).id;
    userEmail = session.user.email ?? undefined;
  }

  if (!userId) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod",
    });
    if (token?.id) {
      userId = token.id as string;
      userEmail = token.email ?? undefined;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planKey } = await req.json();

  const plan = SUBSCRIPTION_PLANS.find((p) => p.key === planKey);
  if (!plan) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXTAUTH_URL ||
    "https://uniqsocial.com";

  // Get or create Stripe customer
  const user = await prisma.user.findUnique({ where: { id: userId } });
  let customerId = user?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  // If user already has an active subscription, send them to the billing portal to change plan
  if (user?.stripeSubscriptionId && user?.subscriptionStatus === "active") {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });
    return NextResponse.json({ url: portalSession.url });
  }

  // Get or create the Stripe Price for this plan
  const priceId = await getOrCreatePrice(plan);

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    metadata: {
      userId,
      planKey: plan.key,
      credits: String(plan.credits),
    },
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
