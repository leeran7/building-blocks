/**
 * Minimal in-memory Prisma stand-in for behavioural tests of src/db/*.
 *
 * The important property: it distinguishes Prisma's additive `{ increment: n }`
 * payload from a plain assignment and records which one each field arrived as.
 * That is what makes an ADR-7 altitude overwrite observable as wrong data
 * rather than something a regex has to spot in the source text.
 */

export const store: Store = {
  blocks: {},
  payments: [],
  deadLetters: [],
  seasons: [],
  seasonReads: 0,
  seasonCreates: 0,
  updateModes: [],
  transactionDepth: 0,
  inTransaction: false,
  wroteOutsideTransaction: false,
};

export const fakePrisma = {
  $transaction: async <T>(fn: (tx: typeof fakeTx) => Promise<T> | T): Promise<T> => {
    store.transactionDepth += 1;
    const wasInTransaction = store.inTransaction;
    store.inTransaction = true;
    try {
      return await fn(fakeTx);
    } finally {
      store.inTransaction = wasInTransaction;
    }
  },
  payment: {
    findUnique: async ({ where }: { where: { stripe_session_id: string } }) =>
      store.payments.find((p) => p.stripe_session_id === where.stripe_session_id) ?? null,
  },
  paymentDeadLetter: {
    create: async ({ data }: { data: FakeDeadLetter }): Promise<FakeDeadLetter> => {
      store.deadLetters.push(data);
      return { ...data };
    },
  },
  season: {
    findFirst: async ({ where }: { where: { is_active?: boolean; category?: string } }) => {
      store.seasonReads += 1;
      return (
        store.seasons.find(
          (s) =>
            (where.is_active === undefined || s.is_active === where.is_active) &&
            (where.category === undefined || s.category === where.category)
        ) ?? null
      );
    },
    create: async ({ data }: { data: Omit<FakeSeason, "id"> }) => {
      store.seasonCreates += 1;
      const season: FakeSeason = { id: `season_${store.seasons.length + 1}`, ...data };
      store.seasons.push(season);
      return { ...season };
    },
  },
};

export function resetStore(): void {
  store.blocks = {};
  store.payments = [];
  store.deadLetters = [];
  store.seasons = [];
  store.seasonReads = 0;
  store.seasonCreates = 0;
  store.updateModes = [];
  store.transactionDepth = 0;
  store.inTransaction = false;
  store.wroteOutsideTransaction = false;
}

export interface FakeBlock {
  id: string;
  altitude: number;
  spend_c: number;
}

export interface FakePayment {
  block_id: string;
  stripe_session_id: string;
  amount_cents: number;
  metres_added: number;
}

export type UpdateMode = "increment" | "assign";

export interface FakeSeason {
  id: string;
  category: string;
  is_active: boolean;
  views_k: number;
  starts_at: Date;
  ends_at: Date;
}

export interface FakeDeadLetter {
  stripe_session_id: string;
  event_type: string;
  amount_cents: number;
  reason: string;
}

export interface Store {
  blocks: Record<string, FakeBlock>;
  payments: FakePayment[];
  deadLetters: FakeDeadLetter[];
  seasons: FakeSeason[];
  /** How many times a season row was read. */
  seasonReads: number;
  /** How many times a season row was written. The ghost-season guard. */
  seasonCreates: number;
  updateModes: Array<{ field: string; mode: UpdateMode }>;
  transactionDepth: number;
  inTransaction: boolean;
  wroteOutsideTransaction: boolean;
}

const MONEY_FIELDS = ["altitude", "spend_c"] as const;

/**
 * Applies one field of a Prisma `data` payload, recording whether it arrived as
 * an additive `{ increment }` or as a plain assignment.
 */
function applyField(
  block: FakeBlock,
  field: (typeof MONEY_FIELDS)[number],
  value: unknown
): void {
  if (typeof value === "object" && value !== null && "increment" in value) {
    block[field] += (value as { increment: number }).increment;
    store.updateModes.push({ field, mode: "increment" });
    return;
  }
  block[field] = value as number;
  store.updateModes.push({ field, mode: "assign" });
}

const fakeTx = {
  block: {
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<FakeBlock> => {
      if (!store.inTransaction) store.wroteOutsideTransaction = true;
      const block = store.blocks[where.id];
      if (!block) throw new Error(`fakePrisma: no such block ${where.id}`);
      for (const field of MONEY_FIELDS) {
        if (field in data) applyField(block, field, data[field]);
      }
      return { ...block };
    },
  },
  payment: {
    create: async ({ data }: { data: FakePayment }): Promise<FakePayment> => {
      if (!store.inTransaction) store.wroteOutsideTransaction = true;
      store.payments.push(data);
      return { ...data };
    },
  },
};
