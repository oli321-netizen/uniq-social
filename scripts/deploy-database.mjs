import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

try {
  run("npx prisma migrate deploy");
} catch {
  console.error("prisma migrate deploy failed.");
  console.error("If this database was created earlier with `prisma db push` and has no _prisma_migrations history, baseline it once:");
  console.error("  npx prisma migrate resolve --applied 0001_init");
  console.error("Then redeploy. Applying the schema with db push so this boot can continue.");
  run("npx prisma db push --skip-generate");
}

try {
  run("node prisma/seed.mjs");
} catch (error) {
  console.error("Database seed failed (startup continues):", error);
}
