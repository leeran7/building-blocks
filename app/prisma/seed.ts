/**
 * prisma/seed.ts
 *
 * No seed data. The old seed populated paid-stacks seasons + sample blocks,
 * which were removed with the paid-stacks deprecation. The free Climb game and
 * 1v1 Duels are driven entirely by real user activity, so there is nothing to
 * pre-populate. Kept as a no-op so `prisma db seed` still resolves.
 *
 * Run via: pnpm db:seed
 */

async function main() {
  console.log("No seed data — nothing to seed.");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
