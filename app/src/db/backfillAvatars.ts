/**
 * One-time avatar backfill for accounts created before avatars existed.
 * CLI: prisma/backfillAvatars.ts (`pnpm db:backfill-avatars [--apply]`).
 *
 * Eligible rows: avatar_id IS NULL AND createdAt < AVATAR_DEFAULT_SINCE, not a
 * duel guest ("guest:" id) and not a deleted-account tombstone
 * ("@deleted.invalid" email). Each gets backfillAvatarFor(id, display_name):
 * the pseudonym's animal without a display name (the shown name is
 * unchanged), else a random catalogue avatar.
 *
 * Every write is a conditional updateMany that re-checks eligibility plus
 * `avatar_id IS NULL` and the display_name that was read, so a live save
 * racing the script wins, and a re-run writes nothing (idempotent).
 */

import { randomInt } from "node:crypto";
import { AVATARS } from "../lib/avatars";
import { defaultAvatarFor } from "../lib/handle";

/** A uniform integer in [0, n). Defaults to crypto.randomInt; injectable for tests. */
export type RandomIndex = (n: number) => number;

/**
 * A catalogue id picked uniformly at random. `rand` must return an integer in
 * [0, n); anything else is a programming error and throws rather than falling
 * back to some default avatar.
 */
export function randomAvatarId(rand: RandomIndex = randomInt): string {
  const i = rand(AVATARS.length);
  if (!Number.isInteger(i) || i < 0 || i >= AVATARS.length) {
    throw new RangeError(`randomAvatarId: index ${i} is outside the catalogue`);
  }
  return AVATARS[i].id;
}

/**
 * The avatar to backfill for `id`, given the display name stored on its row:
 * the pseudonym's own animal when there is no display name (null or blank), so
 * the shown name does not change; else a uniformly random catalogue avatar.
 */
export function backfillAvatarFor(id: string, displayName: string | null, rand: RandomIndex = randomInt): string {
  return displayName?.trim() ? randomAvatarId(rand) : defaultAvatarFor(id);
}

/**
 * Accounts created at or after this instant got a default avatar from
 * ensureUser's `create` (#147, a9c7233, committed 2026-09-25T13:25:59-04:00).
 * On such a row a NULL avatar_id is an explicit Initials choice: leave it.
 * Accounts created between the commit and its deploy keep NULL and render
 * initials, the safe direction.
 */
export const AVATAR_DEFAULT_SINCE = new Date("2026-09-25T17:25:59Z");

/** Duel guest placeholder ids (src/db/user.ts ensureGuestUser). */
export const GUEST_ID_PREFIX = "guest:";
/** Tombstone email suffix written by DELETE /api/account/delete. */
export const DELETED_EMAIL_SUFFIX = "@deleted.invalid";

export const DEFAULT_BATCH_SIZE = 500;
const SAMPLE_SIZE = 10;

/** The `where` shape of BACKFILL_ELIGIBLE (a Prisma UserWhereInput subset). */
export interface EligibleWhere {
  avatar_id: null;
  createdAt: { lt: Date };
  NOT: Array<{ id: { startsWith: string } } | { email: { endsWith: string } }>;
}

/** The rows this backfill may touch. Shared by the scan and every write. */
export const BACKFILL_ELIGIBLE: EligibleWhere = {
  avatar_id: null,
  createdAt: { lt: AVATAR_DEFAULT_SINCE },
  NOT: [{ id: { startsWith: GUEST_ID_PREFIX } }, { email: { endsWith: DELETED_EMAIL_SUFFIX } }],
};

export interface BackfillCandidate {
  id: string;
  display_name: string | null;
}

/** The slice of the Prisma client this needs; the real `prisma` satisfies it. */
export interface BackfillClient {
  user: {
    findMany(args: {
      where: EligibleWhere & { id?: { gt: string } };
      select: { id: true; display_name: true };
      orderBy: { id: "asc" };
      take: number;
    }): Promise<BackfillCandidate[]>;
    updateMany(args: {
      where: EligibleWhere & { id: string; display_name: string | null };
      data: { avatar_id: string };
    }): Promise<{ count: number }>;
  };
}

export interface BackfillOptions {
  /** Write only when true; otherwise report what would be written. */
  apply: boolean;
  batchSize?: number;
  rand?: RandomIndex;
}

/** A sample row for the report. No email and no display name text. */
export interface BackfillSample {
  id: string;
  hasDisplayName: boolean;
  avatarId: string;
}

export interface BackfillSummary {
  mode: "dry-run" | "apply";
  /** Eligible rows found. */
  scanned: number;
  /** Rows updated (always 0 in a dry run). */
  written: number;
  /** Rows whose conditional write matched nothing (changed since the scan). */
  skipped: number;
  /** Rows that got (or would get) the pseudonym's animal. */
  pseudonym: number;
  /** Rows that got (or would get) a random avatar. */
  random: number;
  sample: BackfillSample[];
}

/** Run the backfill (dry run unless `apply`). Pages by id, so it is safe on a large table. */
export async function backfillAvatars(client: BackfillClient, opts: BackfillOptions): Promise<BackfillSummary> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError(`batchSize must be a positive integer`);
  const summary: BackfillSummary = {
    mode: opts.apply ? "apply" : "dry-run",
    scanned: 0,
    written: 0,
    skipped: 0,
    pseudonym: 0,
    random: 0,
    sample: [],
  };

  let after: string | null = null;
  for (;;) {
    const batch: BackfillCandidate[] = await client.user.findMany({
      where: after === null ? BACKFILL_ELIGIBLE : { ...BACKFILL_ELIGIBLE, id: { gt: after } },
      select: { id: true, display_name: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    for (const row of batch) await backfillRow(client, row, opts, summary);
    if (batch.length < batchSize) return summary;
    after = batch[batch.length - 1].id;
  }
}

async function backfillRow(
  client: BackfillClient,
  row: BackfillCandidate,
  opts: BackfillOptions,
  summary: BackfillSummary
): Promise<void> {
  summary.scanned++;
  const hasDisplayName = Boolean(row.display_name?.trim());
  const avatarId = backfillAvatarFor(row.id, row.display_name, opts.rand);
  if (hasDisplayName) summary.random++;
  else summary.pseudonym++;
  if (summary.sample.length < SAMPLE_SIZE) summary.sample.push({ id: row.id, hasDisplayName, avatarId });
  if (!opts.apply) return;
  const { count } = await client.user.updateMany({
    where: { ...BACKFILL_ELIGIBLE, id: row.id, display_name: row.display_name },
    data: { avatar_id: avatarId },
  });
  if (count > 0) summary.written += count;
  else summary.skipped++;
}
