import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export type PlanName = "free" | "starter" | "growth" | "pro" | "business" | "agency";

export const PLAN_DETAILS: Record<PlanName, { label: string; credits: number; price: string }> = {
  free: { label: "Free", credits: 5, price: "0" },
  starter: { label: "Starter", credits: 100, price: "24" },
  growth: { label: "Growth", credits: 500, price: "75" },
  pro: { label: "Pro", credits: 1500, price: "150" },
  business: { label: "Business", credits: 5000, price: "350" },
  agency: { label: "Agency", credits: 15000, price: "750" },
};

export async function redeemPromoCode(
  userId: string,
  code: string
): Promise<{ success: boolean; error?: string; plan?: PlanName; creditsAdded?: number }> {
  const upper = code.toUpperCase().trim();

  const promo = await prisma.promoCode.findUnique({ where: { code: upper } });
  if (!promo) return { success: false, error: "Invalid promo code" };
  if (promo.uses >= promo.maxUses) return { success: false, error: "This code has already been used" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "User not found" };

  // Apply plan and credits atomically
  await prisma.$transaction([
    prisma.promoCode.update({
      where: { code: upper },
      data: { uses: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        plan: promo.plan,
        credits: { increment: promo.bonusCredits },
      },
    }),
  ]);

  return {
    success: true,
    plan: promo.plan as PlanName,
    creditsAdded: promo.bonusCredits,
  };
}

export async function createUser(email: string, password: string) {
  const normalised = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: normalised } });
  if (existing) throw new Error("Email already registered");

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: normalised,
      password: hashed,
      credits: 5,
      plan: "free",
    },
  });

  return user;
}

export async function getUserByEmail(email: string) {
  const normalised = email.toLowerCase().trim();
  return prisma.user.findUnique({ where: { email: normalised } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function verifyPassword(user: { password: string }, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}

export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.credits < amount) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { credits: { decrement: amount } },
  });

  return true;
}

export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.credits ?? 0;
}

export async function getUserPlan(userId: string): Promise<PlanName> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return (user?.plan as PlanName) ?? "free";
}
