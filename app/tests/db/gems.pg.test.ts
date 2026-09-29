/**
 * Shop gems on a REAL Postgres (src/db/gems.ts): a paid pack credits once,
 * a spend never overdraws (also under concurrency), a retried spend applies
 * once, a skin needs its character, and a bought character is then
 * selectable. The guarantees are the user row lock, unique keys and the
 * gems >= 0 CHECK, which a mocked Prisma cannot show.
 *
 * Opt-in, against a THROWAWAY local database, like levels.pg.test.ts:
 *
 *   L=postgresql://postgres@127.0.0.1:55432/gemtest
 *   DATABASE_URL=$L DIRECT_URL=$L pnpm prisma db push --skip-generate
 *   psql $L -c 'ALTER TABLE users ADD CONSTRAINT users_gems_nonnegative CHECK (gems >= 0)'
 *   LEVELS_PG_URL=$L pnpm vitest run tests/db/gems.pg.test.ts
 *
 * (db push does not create CHECK constraints; the migration does.)
 *
 * The suite TRUNCATEs users and the Shop tables, so it refuses any
 * LEVELS_PG_URL that is not on a loopback host. CI has no Postgres service,
 * so there it is skipped.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const PG_URL = process.env.LEVELS_PG_URL ?? "";

const db = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../src/db/client", () => ({
  get prisma() {
    return db.client;
  },
}));

import { buyCharacter, creditGemPack, gemBalance, GemError, shopState, spendGems } from "../../src/db/gems";
import { checkAvatarForUser } from "../../src/db/avatarUnlocks";
import { GEM_PACKS, gemPackById } from "../../src/lib/gemPacks";
import { SKIN_GEMS, WRAITH_GEMS } from "../../src/lib/avatars";
import { isLocalDbUrl } from "../../scripts/localDbGuard";

const PACK_1200 = gemPackById("gems-1200")!;
const PACK_2600 = gemPackById("gems-2600")!;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (err) {
    if (err instanceof GemError) return err.code;
    throw err;
  }
}

describe.skipIf(!PG_URL)("Shop gems on Postgres", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!isLocalDbUrl(PG_URL)) {
      throw new Error("LEVELS_PG_URL must be a postgresql:// URL on a local throwaway database");
    }
    const url = new URL(PG_URL);
    url.searchParams.set("connection_limit", "16");
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    db.client = prisma;
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "gem_ledger", "gem_purchases", "owned_characters", "level_progress", "users" CASCADE'
    );
  });

  const user = (id: string) => prisma.user.create({ data: { id, email: `${id}@example.test` } });
  const credit = (userId: string, externalId: string, pack = PACK_1200, provider: "stripe" | "apple" = "apple") =>
    creditGemPack({ userId, provider, externalId, pack });

  it("credits a paid pack once per provider transaction, with one ledger row", async () => {
    await user("u1");
    expect(await credit("u1", "tx-1")).toEqual({ outcome: "credited", balance: 1200 });
    expect(await credit("u1", "tx-1")).toEqual({ outcome: "duplicate", balance: 1200 });
    // The same id from the other provider is a different payment.
    expect(await credit("u1", "tx-1", PACK_1200, "stripe")).toEqual({ outcome: "credited", balance: 2400 });
    const ledger = await prisma.gemLedger.findMany({ where: { user_id: "u1" }, orderBy: { created_at: "asc" } });
    expect(ledger.map((r) => [r.kind, r.amount, r.balance_after, r.idempotency_key])).toEqual([
      ["PURCHASE", 1200, 1200, "apple:tx-1"],
      ["PURCHASE", 1200, 2400, "stripe:tx-1"],
    ]);
  });

  it("credits the same App Store transaction once even when two accounts post it at once", async () => {
    await user("u1");
    await user("u2");
    const results = await Promise.all([credit("u1", "tx-shared"), credit("u2", "tx-shared")].map((p) => p.catch((e) => e)));
    const credited = results.filter((r) => r && r.outcome === "credited");
    expect(credited).toHaveLength(1);
    expect((await gemBalance("u1")) + (await gemBalance("u2"))).toBe(1200);
    expect(await prisma.gemPurchase.count()).toBe(1);
  });

  it("refuses a short spend without writing, spends exactly, and applies a retried key once", async () => {
    await user("u1");
    await credit("u1", "tx-1");
    const spend = (key: string, amount = 1000) =>
      prisma.$transaction((tx) => spendGems(tx, { userId: "u1", amount, reason: "lives", ref: null, idempotencyKey: key }));

    expect(await codeOf(spend("k-big", 1201))).toBe("INSUFFICIENT_GEMS");
    expect(await gemBalance("u1")).toBe(1200);
    expect(await prisma.gemLedger.count({ where: { kind: "SPEND" } })).toBe(0);

    expect(await spend("k-1")).toEqual({ outcome: "spent", balance: 200 });
    expect(await spend("k-1")).toEqual({ outcome: "duplicate", balance: 200 });
    expect(await gemBalance("u1")).toBe(200);
    expect(await codeOf(spend("k-2"))).toBe("INSUFFICIENT_GEMS");
  });

  it("never lets two concurrent purchases overdraw one balance", async () => {
    await user("u1");
    await credit("u1", "tx-1", PACK_2600); // enough for exactly one Wraith (2000)
    await prisma.$executeRawUnsafe(`UPDATE users SET gems = ${WRAITH_GEMS} WHERE id = 'u1'`);
    const spends = Array.from({ length: 6 }, (_, i) =>
      prisma
        .$transaction((tx) =>
          spendGems(tx, { userId: "u1", amount: WRAITH_GEMS, reason: "test", ref: null, idempotencyKey: `c-${i}` })
        )
        .then(() => "spent")
        .catch((e: unknown) => (e instanceof GemError ? e.code : String(e)))
    );
    const outcomes = await Promise.all(spends);
    expect(outcomes.filter((o) => o === "spent")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "INSUFFICIENT_GEMS")).toHaveLength(5);
    expect(await gemBalance("u1")).toBe(0);
  });

  it("rejects a negative balance at the database, whatever the write path", async () => {
    await user("u1");
    await expect(prisma.$executeRawUnsafe(`UPDATE users SET gems = -1 WHERE id = 'u1'`)).rejects.toThrow(
      /users_gems_nonnegative/
    );
  });

  it("sells the Wraith, then its skin, and makes both selectable; refuses a second buy", async () => {
    await user("u1");
    await credit("u1", "tx-1", PACK_2600);
    await credit("u1", "tx-2", PACK_1200);
    expect(await gemBalance("u1")).toBe(3800);

    // The Void Walker needs the Wraith first.
    expect(await codeOf(buyCharacter("u1", "wraith-void"))).toBe("CHARACTER_REQUIRED");
    expect((await checkAvatarForUser("u1", "wraith")).lock?.kind).toBe("purchase");

    expect(await buyCharacter("u1", "wraith")).toEqual({ gems: 3800 - WRAITH_GEMS, ownedIds: ["wraith"] });
    expect((await checkAvatarForUser("u1", "wraith")).lock).toBeNull();
    expect(await codeOf(buyCharacter("u1", "wraith"))).toBe("OWNED");

    expect(await codeOf(buyCharacter("u1", "wraith-void"))).toBe("resolved");
    expect(await shopState("u1")).toEqual({ gems: 3800 - WRAITH_GEMS - SKIN_GEMS, ownedIds: ["wraith", "wraith-void"] });
    expect((await checkAvatarForUser("u1", "wraith-void")).lock).toBeNull();
  });

  it("sells a star character's skin only once its stars are earned, and never the star character itself", async () => {
    await user("u1");
    await credit("u1", "tx-1", GEM_PACKS[3]);
    expect(await codeOf(buyCharacter("u1", "kestrel"))).toBe("NOT_FOR_SALE");
    expect(await codeOf(buyCharacter("u1", "kestrel-void"))).toBe("CHARACTER_REQUIRED");
    await prisma.levelProgress.createMany({
      data: [1, 2, 3, 4, 5].map((level) => ({ userId: "u1", season: 1, level, stars: 3, best_ticks: 900, sim_version: 1 })),
    });
    // 15 stars: Kestrel is earned, so its Void skin is for sale.
    expect(await codeOf(buyCharacter("u1", "kestrel-void"))).toBe("resolved");
    expect(await codeOf(buyCharacter("u1", "kestrel-void"))).toBe("OWNED");
    expect(await gemBalance("u1")).toBe(GEM_PACKS[3].gems - SKIN_GEMS);
  });

  it("refuses a purchase short of gems without taking any or granting the character", async () => {
    await user("u1");
    await credit("u1", "tx-1");
    expect(await codeOf(buyCharacter("u1", "wraith"))).toBe("INSUFFICIENT_GEMS");
    expect(await shopState("u1")).toEqual({ gems: 1200, ownedIds: [] });
  });
});
