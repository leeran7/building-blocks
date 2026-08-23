/**
 * prisma/seed.ts
 *
 * Creates an initial active Season if none exists.
 * Run via: pnpm db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.season.findFirst({
    where: { is_active: true },
  });

  if (existing) {
    console.log(`Active season already exists: ${existing.id} (skipping seed)`);
    return;
  }

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + 90); // default 90-day season

  const season = await prisma.season.create({
    data: {
      starts_at: now,
      ends_at: endsAt,
      is_active: true,
      views_k: 0,
    },
  });

  console.log(`Created initial active season: ${season.id}`);
  console.log(`  starts_at: ${season.starts_at.toISOString()}`);
  console.log(`  ends_at:   ${season.ends_at.toISOString()}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
