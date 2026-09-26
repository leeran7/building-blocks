/**
 * prisma/backfillAvatars.ts — ONE-TIME avatar backfill for accounts created
 * before avatars existed (logic and rules: src/db/backfillAvatars.ts).
 *
 * Dry run (default, writes nothing):  pnpm db:backfill-avatars
 * Apply:                              pnpm db:backfill-avatars --apply
 *
 * Uses DATABASE_URL like every Prisma command. Safe to re-run: every write is
 * conditional on avatar_id still being NULL. It runs outside Next.js, so it
 * cannot call revalidateTag: the public leaderboard's 60s cache shows the new
 * avatars once it expires.
 */

import { prisma } from "../src/db/client";
import { backfillAvatars } from "../src/db/backfillAvatars";

const APPLY_FLAG = "--apply";
const KNOWN_FLAGS = new Set([APPLY_FLAG]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !KNOWN_FLAGS.has(a));
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(" ")}. Usage: backfillAvatars.ts [${APPLY_FLAG}]`);
    process.exitCode = 1;
    return;
  }
  const apply = args.includes(APPLY_FLAG);
  const summary = await backfillAvatars(prisma, { apply });
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) console.log(`Dry run: nothing written. Random picks differ on --apply. Re-run with ${APPLY_FLAG} to write.`);
}

main()
  .catch((e) => {
    console.error("Avatar backfill failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
