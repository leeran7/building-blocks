/**
 * buyLivesRefill (src/db/levels.ts) against a REAL Postgres: a refill charged
 * once under concurrent taps, and nothing written when it is refused. The
 * guarantees are the user row lock and spendGems (src/db/gems.ts), which a
 * mocked Prisma cannot say anything about.
 *
 * Opt-in, against a THROWAWAY local database, like levels.pg.test.ts:
 *
 *   L=postgresql://postgres@127.0.0.1:55432/leveltest
 *   DATABASE_URL=$L DIRECT_URL=$L pnpm db:migrate:local
 *   LEVELS_PG_URL=$L pnpm vitest run tests/db/livesRefill.pg.test.ts
 *
 * The suite TRUNCATEs users, so it refuses any LEVELS_PG_URL that is not on a
 * loopback host. CI has no Postgres service, so there it is skipped.
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

import { LevelError, buyLivesRefill } from "../../src/db/levels";
import { LIVES_REFILL_GEMS, MAX_LIVES } from "../../src/levels/rules";
import { isLocalDbUrl } from "../../scripts/localDbGuard";

const T0 = new Date("2026-09-29T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (err) {
    if (err instanceof LevelError) return err.code;
    throw err;
  }
}

describe.skipIf(!PG_URL)("lives refill on Postgres", () => {
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
    await prisma.$executeRawUnsafe('TRUNCATE "users" CASCADE');
  });

  async function user(id: string, extra: { gems?: number; lives?: number; livesUpdatedAt?: Date | null } = {}) {
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        gems: extra.gems ?? 0,
        lives: extra.lives ?? MAX_LIVES,
        lives_updated_at: extra.livesUpdatedAt ?? null,
      },
    });
  }

  const row = (id: string) =>
    prisma.user.findUniqueOrThrow({ where: { id }, select: { gems: true, lives: true, lives_updated_at: true } });
  const ledger = (id: string) =>
    prisma.gemLedger.findMany({ where: { user_id: id }, orderBy: { created_at: "asc" } });

  describe("buyLivesRefill", () => {
    it("tops an empty player up to full and charges the refill price", async () => {
      await user("a", { gems: 120, lives: 0, livesUpdatedAt: at(-10) });
      const refill = await buyLivesRefill("a", T0);
      expect(refill).toEqual({ lives: MAX_LIVES, nextLifeAt: null, gems: 120 - LIVES_REFILL_GEMS });
      expect(await row("a")).toMatchObject({ gems: 120 - LIVES_REFILL_GEMS, lives: MAX_LIVES });
      expect(await ledger("a")).toMatchObject([
        { amount: -LIVES_REFILL_GEMS, balance_after: 120 - LIVES_REFILL_GEMS, kind: "SPEND", reason: "lives" },
      ]);
    });

    it("charges once when the button is tapped twice at the same moment", async () => {
      await user("a", { gems: 500, lives: 0, livesUpdatedAt: at(-10) });
      const codes = await Promise.all([codeOf(buyLivesRefill("a", T0)), codeOf(buyLivesRefill("a", T0))]);
      expect(codes.sort()).toEqual(["LIVES_FULL", "resolved"]);
      expect(await row("a")).toMatchObject({ gems: 500 - LIVES_REFILL_GEMS, lives: MAX_LIVES });
      expect(await ledger("a")).toHaveLength(1);
    });

    it("refuses a full player, counting lives the timer has already refilled", async () => {
      await user("a", { gems: 500, lives: 4, livesUpdatedAt: at(-40) });
      expect(await codeOf(buyLivesRefill("a", T0))).toBe("LIVES_FULL");
      expect(await row("a")).toMatchObject({ gems: 500, lives: 4 });
      expect(await ledger("a")).toHaveLength(0);
    });

    it("refuses a short balance and writes nothing", async () => {
      await user("a", { gems: LIVES_REFILL_GEMS - 1, lives: 0, livesUpdatedAt: at(-10) });
      const err = await buyLivesRefill("a", T0).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LevelError);
      expect(err).toMatchObject({ code: "NOT_ENOUGH_GEMS", details: { gems: LIVES_REFILL_GEMS - 1, cost: LIVES_REFILL_GEMS } });
      expect(await row("a")).toMatchObject({ gems: LIVES_REFILL_GEMS - 1, lives: 0, lives_updated_at: at(-10) });
      expect(await ledger("a")).toHaveLength(0);
    });
  });
});
