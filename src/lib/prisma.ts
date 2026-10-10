import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  __promo_seeded?: boolean;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Seed default promo codes on first use
export async function ensureSeeded() {
  if (globalForPrisma.__promo_seeded) return;
  globalForPrisma.__promo_seeded = true;

  try {
    await prisma.promoCode.upsert({
      where: { code: "GAY" },
      update: {},
      create: {
        code: "GAY",
        plan: "agency",
        bonusCredits: 15000,
        maxUses: 1,
        uses: 0,
      },
    });
  } catch (e) {
    console.error("Failed to seed promo codes:", e);
    globalForPrisma.__promo_seeded = false;
  }
}

// Run seed on import
ensureSeeded().catch(() => {});
