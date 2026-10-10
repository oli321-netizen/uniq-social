import bcrypt from "bcryptjs";

export type PlanName = "free" | "starter" | "growth" | "pro" | "business" | "agency";

export interface User {
  id: string;
  email: string;
  password: string;
  credits: number;
  plan: PlanName;
  createdAt: Date;
}

export const PLAN_DETAILS: Record<PlanName, { label: string; credits: number; price: string }> = {
  free: { label: "Free", credits: 5, price: "0" },
  starter: { label: "Starter", credits: 100, price: "24" },
  growth: { label: "Growth", credits: 500, price: "75" },
  pro: { label: "Pro", credits: 1500, price: "150" },
  business: { label: "Business", credits: 5000, price: "350" },
  agency: { label: "Agency", credits: 15000, price: "750" },
};

// ─── Persist the store on globalThis so it survives HMR / serverless module reloads ───
const globalStore = globalThis as unknown as {
  __uniq_users?: Map<string, User>;
  __uniq_promos?: Map<string, PromoCode>;
};

interface PromoCode {
  plan: PlanName;
  bonusCredits: number;
  maxUses: number;
  uses: number;
}

if (!globalStore.__uniq_users) {
  globalStore.__uniq_users = new Map();
}
if (!globalStore.__uniq_promos) {
  globalStore.__uniq_promos = new Map([
    ["GAY", { plan: "agency" as PlanName, bonusCredits: 15000, maxUses: 1, uses: 0 }],
  ]);
}

const users = globalStore.__uniq_users;
const promoCodes = globalStore.__uniq_promos;

export function redeemPromoCode(userId: string, code: string): { success: boolean; error?: string; plan?: PlanName; creditsAdded?: number } {
  const upper = code.toUpperCase().trim();
  const promo = promoCodes.get(upper);
  if (!promo) return { success: false, error: "Invalid promo code" };
  if (promo.uses >= promo.maxUses) return { success: false, error: "This code has already been used" };

  const user = users.get(userId);
  if (!user) return { success: false, error: "User not found" };

  // Apply plan and credits
  promo.uses++;
  user.plan = promo.plan;
  user.credits += promo.bonusCredits;

  return {
    success: true,
    plan: promo.plan,
    creditsAdded: promo.bonusCredits,
  };
}

export async function createUser(email: string, password: string): Promise<User> {
  const existing = getUserByEmail(email);
  if (existing) throw new Error("Email already registered");

  const hashed = await bcrypt.hash(password, 12);
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    password: hashed,
    credits: 5, // free starter credits
    plan: "free",
    createdAt: new Date(),
  };
  users.set(user.id, user);
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  const normalised = email.toLowerCase().trim();
  for (const u of users.values()) {
    if (u.email === normalised) return u;
  }
  return undefined;
}

export function getUserById(id: string): User | undefined {
  return users.get(id);
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}

export function deductCredits(userId: string, amount: number): boolean {
  const user = users.get(userId);
  if (!user || user.credits < amount) return false;
  user.credits -= amount;
  return true;
}

export function getCredits(userId: string): number {
  return users.get(userId)?.credits ?? 0;
}

export function getUserPlan(userId: string): PlanName {
  return users.get(userId)?.plan ?? "free";
}
