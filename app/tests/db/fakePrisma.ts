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
  climbRecords: [],
  climbRuns: [],
  users: {},
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
  user: {
    findUnique: async ({
      where,
    }: {
      where: { id: string };
      select?: { display_name?: boolean };
    }) => store.users[where.id] ?? null,
  },
  climbRun: {
    create: async ({ data }: { data: Omit<FakeClimbRun, "created_at"> & { created_at?: Date } }) => {
      const row: FakeClimbRun = { created_at: new Date(), ...data };
      store.climbRuns.push(row);
      return { ...row };
    },
    findMany: async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where?: { userId?: string };
      orderBy?: { created_at?: "asc" | "desc" };
      take?: number;
      select?: Record<string, boolean>;
    }) => {
      let rows = store.climbRuns.filter(
        (r) => where?.userId === undefined || r.userId === where.userId
      );
      if (orderBy?.created_at === "desc") {
        rows = [...rows].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      }
      if (take != null) rows = rows.slice(0, take);
      return rows.map((r) => pickClimbRun(r, select));
    },
  },
  climbRecord: {
    findUnique: async ({
      where,
    }: {
      where: { climb_record_user_category_board: FakeClimbRecordKey };
    }) => {
      const key = where.climb_record_user_category_board;
      return findClimbRecord(key) ?? null;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { climb_record_user_category_board: FakeClimbRecordKey };
      create: Omit<FakeClimbRecord, "id" | "updated_at"> & { updated_at?: Date };
      update: { peak_y?: number; wins?: { increment: number } };
    }) => {
      const key = where.climb_record_user_category_board;
      const existing = findClimbRecord(key);
      if (!existing) {
        const row: FakeClimbRecord = {
          id: `cr_${store.climbRecords.length + 1}`,
          updated_at: create.updated_at ?? new Date(),
          ...create,
        };
        store.climbRecords.push(row);
        return { ...row };
      }
      if (typeof update.peak_y === "number") existing.peak_y = update.peak_y;
      if (update.wins && typeof update.wins === "object" && "increment" in update.wins) {
        existing.wins += update.wins.increment;
      }
      existing.updated_at = new Date();
      return { ...existing };
    },
    findMany: async ({
      where,
      orderBy,
      take,
      distinct,
    }: {
      where?: FakeClimbRecordWhere;
      orderBy?: Array<{ peak_y?: "asc" | "desc"; updated_at?: "asc" | "desc" }>;
      take?: number;
      select?: { userId?: boolean; peak_y?: boolean; wins?: boolean; board?: boolean; user?: unknown };
      distinct?: string[];
    }) => {
      let rows = store.climbRecords.filter((r) => matchesClimbWhere(r, where));
      if (orderBy && orderBy.length > 0) {
        rows = [...rows].sort((a, b) => compareClimbRecords(a, b, orderBy));
      }
      if (distinct && distinct.length > 0) {
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const key = climbDistinctKey(r, distinct);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (take != null) rows = rows.slice(0, take);
      return rows.map((r) => ({
        userId: r.userId,
        peak_y: r.peak_y,
        wins: r.wins,
        board: r.board,
        user: { display_name: store.users[r.userId]?.display_name ?? null },
      }));
    },
    count: async ({ where }: { where?: FakeClimbRecordWhere }) =>
      store.climbRecords.filter((r) => matchesClimbWhere(r, where)).length,
    findFirst: async ({
      where,
      select,
    }: {
      where?: FakeClimbRecordWhere;
      select?: { id?: boolean };
    }) => {
      const row = store.climbRecords.find((r) => matchesClimbWhere(r, where));
      if (!row) return null;
      if (select?.id) return { id: row.id };
      return { ...row };
    },
    aggregate: async ({
      where,
      _max,
    }: {
      where?: FakeClimbRecordWhere;
      _max?: { peak_y?: boolean };
    }) => {
      const rows = store.climbRecords.filter((r) => matchesClimbWhere(r, where));
      if (!_max?.peak_y || rows.length === 0) {
        return { _max: { peak_y: null } };
      }
      let maxPeak = rows[0].peak_y;
      for (const row of rows) {
        if (row.peak_y > maxPeak) maxPeak = row.peak_y;
      }
      return { _max: { peak_y: maxPeak } };
    },
  },
};

export function resetStore(): void {
  store.blocks = {};
  store.payments = [];
  store.deadLetters = [];
  store.seasons = [];
  store.climbRecords = [];
  store.climbRuns = [];
  store.users = {};
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

export interface FakeClimbRecordKey {
  userId: string;
  category_slug: string;
  board: string;
}

export interface FakeClimbRecord {
  id: string;
  userId: string;
  category_slug: string;
  board: string;
  peak_y: number;
  wins: number;
  updated_at: Date;
}

export interface FakeClimbRun {
  userId: string | null;
  category_slug: string;
  board?: string;
  peak_y: number;
  finished: boolean;
  finished_tick: number | null;
  seed: string;
  replay_token?: string | null;
  created_at: Date;
}

export interface FakeUser {
  id: string;
  display_name: string | null;
}

export interface FakeClimbRecordWhere {
  userId?: string;
  category_slug?: string;
  board?: string;
  peak_y?: { gt?: number };
}

export interface Store {
  blocks: Record<string, FakeBlock>;
  payments: FakePayment[];
  deadLetters: FakeDeadLetter[];
  seasons: FakeSeason[];
  climbRecords: FakeClimbRecord[];
  climbRuns: FakeClimbRun[];
  users: Record<string, FakeUser>;
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

function findClimbRecord(key: FakeClimbRecordKey): FakeClimbRecord | undefined {
  return store.climbRecords.find(
    (r) =>
      r.userId === key.userId &&
      r.category_slug === key.category_slug &&
      r.board === key.board
  );
}

function climbDistinctKey(row: FakeClimbRecord, fields: string[]): string {
  return fields
    .map((field) => {
      if (field === "userId") return row.userId;
      if (field === "board") return row.board;
      if (field === "category_slug") return row.category_slug;
      if (field === "id") return row.id;
      return field;
    })
    .join("\0");
}

function matchesClimbWhere(
  row: FakeClimbRecord,
  where: FakeClimbRecordWhere | undefined
): boolean {
  if (!where) return true;
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.category_slug !== undefined && row.category_slug !== where.category_slug) {
    return false;
  }
  if (where.board !== undefined && row.board !== where.board) return false;
  if (where.peak_y?.gt !== undefined && !(row.peak_y > where.peak_y.gt)) return false;
  return true;
}

function compareClimbRecords(
  a: FakeClimbRecord,
  b: FakeClimbRecord,
  orderBy: Array<{ peak_y?: "asc" | "desc"; updated_at?: "asc" | "desc" }>
): number {
  for (const rule of orderBy) {
    if (rule.peak_y) {
      const cmp = a.peak_y - b.peak_y;
      if (cmp !== 0) return rule.peak_y === "desc" ? -cmp : cmp;
    }
    if (rule.updated_at) {
      const cmp = a.updated_at.getTime() - b.updated_at.getTime();
      if (cmp !== 0) return rule.updated_at === "desc" ? -cmp : cmp;
    }
  }
  return 0;
}

function pickClimbRun(
  row: FakeClimbRun,
  select?: Record<string, boolean>
): Record<string, unknown> {
  const created = row.created_at ?? new Date(0);
  const full = {
    id: "run",
    userId: row.userId,
    peak_y: row.peak_y,
    created_at: created,
    replay_token: row.replay_token ?? null,
  };
  if (!select) return full;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = full[key as keyof typeof full];
  }
  return out;
}
