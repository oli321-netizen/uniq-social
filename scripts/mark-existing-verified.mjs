import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { emailVerified: false },
    data: { emailVerified: true },
  });
  console.log(`Marked ${result.count} existing users as email-verified`);
}

main()
  .catch((e) => console.error("Failed to mark existing users:", e))
  .finally(() => prisma.$disconnect());
