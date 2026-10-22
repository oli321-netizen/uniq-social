import Stripe from "stripe";

let _stripe: Stripe | null = null;
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    }
    return (_stripe as any)[prop];
  },
});

/* ── One-time credit top-ups ── */
export const CREDIT_PACKS = [
  { credits: 20, priceInPence: 520, label: "20 credits" },
  { credits: 50, priceInPence: 1300, label: "50 credits" },
  { credits: 100, priceInPence: 2600, label: "100 credits" },
  { credits: 250, priceInPence: 6500, label: "250 credits" },
  { credits: 500, priceInPence: 13000, label: "500 credits" },
  { credits: 1000, priceInPence: 26000, label: "1,000 credits" },
] as const;

/* ── Monthly subscription plans ── */
export type PlanKey = "starter" | "growth" | "pro" | "business" | "agency";

export interface SubscriptionPlan {
  key: PlanKey;
  label: string;
  credits: number;
  priceInPence: number; // monthly GBP in pence
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { key: "starter", label: "Starter", credits: 100, priceInPence: 2400 },
  { key: "growth", label: "Growth", credits: 500, priceInPence: 7500 },
  { key: "pro", label: "Pro", credits: 1500, priceInPence: 15000 },
  { key: "business", label: "Business", credits: 5000, priceInPence: 35000 },
  { key: "agency", label: "Agency", credits: 15000, priceInPence: 75000 },
];

/**
 * Get or create a Stripe Price for a subscription plan.
 * We look up by metadata so we never create duplicates.
 */
export async function getOrCreatePrice(plan: SubscriptionPlan): Promise<string> {
  // Search for existing price with our plan key
  const existing = await stripe.prices.search({
    query: `active:'true' AND metadata['plan_key']:'${plan.key}'`,
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  // Create product + price
  const product = await stripe.products.create({
    name: `UniqSocial ${plan.label}`,
    description: `${plan.credits.toLocaleString()} video processing credits per month`,
    metadata: { plan_key: plan.key },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.priceInPence,
    currency: "gbp",
    recurring: { interval: "month" },
    metadata: { plan_key: plan.key },
  });

  return price.id;
}
