import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Upsert the GAY promo code
  await prisma.promoCode.upsert({
    where: { code: "GAY" },
    update: {},
    create: {
      code: "GAY",
      bonusCredits: 15000,
      maxUses: 1,
      uses: 0,
    },
  });

  // Upsert the CHAD promo code
  await prisma.promoCode.upsert({
    where: { code: "CHAD" },
    update: {},
    create: {
      code: "CHAD",
      bonusCredits: 50,
      maxUses: 10000,
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
