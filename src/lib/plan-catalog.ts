/** Display copy for the plan lists. Credits and prices match PLAN_DETAILS and SUBSCRIPTION_PLANS. */

export type PlanRow = {
  key: string;
  label: string;
  price: string;
  monthly: boolean;
  features: { label: string; included: boolean }[];
};

const shared = [
  { label: "Video processing, 1 credit per video", included: true },
  { label: "Variants, creators, results, and presets", included: true },
  { label: "Teams", included: true },
];

const monthly = [
  { key: "starter", label: "Starter", credits: 100, price: "24" },
  { key: "growth", label: "Growth", credits: 500, price: "75" },
  { key: "pro", label: "Pro", credits: 1500, price: "150" },
  { key: "business", label: "Business", credits: 5000, price: "350" },
  { key: "agency", label: "Agency", credits: 15000, price: "750" },
];

export function planCatalog(): PlanRow[] {
  return [
    {
      key: "free",
      label: "Free",
      price: "0",
      monthly: false,
      features: [
        { label: "5 credits when you sign up", included: true },
        ...shared,
        { label: "AI Editor", included: false },
        { label: "Editor Lab", included: false },
      ],
    },
    ...monthly.map((plan) => ({
      key: plan.key,
      label: plan.label,
      price: plan.price,
      monthly: true,
      features: [
        { label: `${plan.credits.toLocaleString()} credits each month`, included: true },
        ...shared,
        { label: "AI Editor", included: true },
        { label: "Editor Lab", included: true },
      ],
    })),
  ];
}

export function planLabel(planKey: string) {
  const plan = planCatalog().find((item) => item.key === planKey);
  return plan?.label || "your plan";
}

export function unlockedLines(planKey: string) {
  const plan = monthly.find((item) => item.key === planKey);
  if (!plan) return ["AI Editor", "Editor Lab"];
  return ["AI Editor", "Editor Lab", `${plan.credits.toLocaleString()} credits each month`];
}
