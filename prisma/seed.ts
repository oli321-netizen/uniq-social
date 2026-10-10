import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Upsert the GAY promo code
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

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
