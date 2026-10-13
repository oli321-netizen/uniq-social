import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Upsert promo codes
  const codes = [
    { code: "GAY", bonusCredits: 15000, maxUses: 1 },
    { code: "CHAD", bonusCredits: 50, maxUses: 10000 },
  ];

  for (const c of codes) {
    await prisma.promoCode.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        bonusCredits: c.bonusCredits,
        maxUses: c.maxUses,
        uses: 0,
      },
    });
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    // Don't crash the app if seed fails
  })
  .finally(() => prisma.$disconnect());
