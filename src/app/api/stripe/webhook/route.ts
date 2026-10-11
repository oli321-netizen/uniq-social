import { NextRequest, NextResponse } from "next/server";
import { stripe, SUBSCRIPTION_PLANS } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    /* ── Checkout completed (one-time OR subscription) ── */
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Subscription checkout — set plan and add initial credits
      if (session.mode === "subscription") {
        const userId = session.metadata?.userId;
        const planKey = session.metadata?.planKey;
        const credits = parseInt(session.metadata?.credits || "0");
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription as Stripe.Subscription | null)?.id;

        if (userId && planKey && subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id;
          const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

          await prisma.user.update({
            where: { id: userId },
            data: {
              plan: planKey,
              stripeSubscriptionId: subscriptionId,
              stripePriceId: priceId || null,
              subscriptionStatus: "active",
              currentPeriodEnd: new Date(periodEnd * 1000),
              credits: { increment: credits },
            },
          });

          // Record transaction
          const planConfig = SUBSCRIPTION_PLANS.find((p) => p.key === planKey);
          await prisma.transaction.create({
            data: {
              userId,
              type: "subscription",
              description: `Subscribed to ${planConfig?.label || planKey} plan`,
              credits,
              amount: planConfig?.priceInPence || 0,
              currency: "gbp",
            },
          });

          console.log(
            `Subscription created: user ${userId} → ${planKey} (+${credits} credits)`
          );
        }
        break;
      }

      // One-time payment — add credits only
      const userId = session.metadata?.userId;
      const credits = parseInt(session.metadata?.credits || "0");
      const amountTotal = (session as unknown as { amount_total: number | null }).amount_total;

      if (userId && credits > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: credits } },
        });

        // Record transaction
        await prisma.transaction.create({
          data: {
            userId,
            type: "credit_purchase",
            description: `Purchased ${credits} credits`,
            credits,
            amount: amountTotal || 0,
            currency: "gbp",
          },
        });

        console.log(`Added ${credits} credits to user ${userId}`);
      }
      break;
    }

    /* ── Subscription renewed — add monthly credits ── */
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;

      // Skip the first invoice (credits already added on checkout.session.completed)
      if (invoice.billing_reason === "subscription_create") break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscriptionId = (invoice as any).subscription as string | null;
      if (!subscriptionId) break;

      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!user) break;

      const plan = SUBSCRIPTION_PLANS.find((p) => p.key === user.plan);
      if (!plan) break;

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          credits: { increment: plan.credits },
          currentPeriodEnd: new Date(periodEnd * 1000),
          subscriptionStatus: "active",
        },
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: "renewal",
          description: `${plan.label} plan renewed — ${plan.credits} credits added`,
          credits: plan.credits,
          amount: plan.priceInPence,
          currency: "gbp",
        },
      });

      console.log(
        `Renewal: user ${user.id} → +${plan.credits} credits (${plan.key})`
      );
      break;
    }

    /* ── Subscription cancelled ── */
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const subscriptionId = sub.id;

      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (user) {
        // Record transaction before wiping plan
        await prisma.transaction.create({
          data: {
            userId: user.id,
            type: "cancellation",
            description: `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} plan cancelled`,
            credits: 0,
            amount: 0,
            currency: "gbp",
          },
        });

        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: "free",
            stripeSubscriptionId: null,
            stripePriceId: null,
            subscriptionStatus: "cancelled",
            currentPeriodEnd: null,
          },
        });
        console.log(`Subscription cancelled: user ${user.id} → free`);
      }
      break;
    }

    /* ── Subscription updated (e.g. plan change via portal) ── */
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const subscriptionId = sub.id;

      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!user) break;

      const priceId = sub.items.data[0]?.price?.id;
      const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          stripePriceId: priceId || null,
          subscriptionStatus: sub.status === "active" ? "active" : sub.status,
          currentPeriodEnd: new Date(periodEnd * 1000),
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
