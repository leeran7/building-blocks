/**
 * One-time avatar backfill (src/db/backfillAvatars.ts, CLI prisma/backfillAvatars.ts).
 *
 * backfillAvatars runs against an in-memory `users` table whose findMany and
 * updateMany honour every `where` operator the script uses (equality incl.
 * null, lt, gt, startsWith, endsWith, NOT) plus orderBy id and take. An
 * unsupported operator throws, so a new condition cannot silently match every
 * row. Dropping any eligibility condition from the real query therefore lets a
 * row through here and fails a test.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_DEFAULT_SINCE,
  backfillAvatarFor,
  backfillAvatars,
  randomAvatarId,
  type BackfillClient,
} from "../../src/db/backfillAvatars";
import { AVATARS, parseAvatarId } from "../../src/lib/avatars";
import { climberHandle, defaultAvatarFor } from "../../src/lib/handle";

interface Row {
  id: string;
  email: string;
  display_name: string | null;
  avatar_id: string | null;
  createdAt: Date;
}

const OLD = new Date("2026-01-01T00:00:00Z");
const rows = new Map<string, Row>();

function seed(row: Partial<Row> & { id: string }): void {
  rows.set(row.id, { email: `${row.id}@e.com`, display_name: null, avatar_id: null, createdAt: OLD, ...row });
}

const scalar = (v: unknown): unknown => (v instanceof Date ? v.getTime() : v);

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) return scalar(value) === scalar(cond);
  return Object.entries(cond).every(([op, arg]) => {
    const v = scalar(value);
    const a = scalar(arg);
    if (op === "lt") return typeof v === "number" && typeof a === "number" && v < a;
    if (op === "gt") return typeof v === "string" && typeof a === "string" && v > a;
    if (op === "startsWith") return typeof v === "string" && v.startsWith(String(a));
    if (op === "endsWith") return typeof v === "string" && v.endsWith(String(a));
    throw new Error(`fake: unsupported operator ${op}`);
  });
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      return list.every((c) => !matches(row, c as Record<string, unknown>));
    }
    return matchField(row[k as keyof Row], cond);
  });
}

const findMany = vi.fn(
  async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
    [...rows.values()]
      .filter((r) => matches(r, where))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, take)
      .map((r) => ({ id: r.id, display_name: r.display_name }))
);
const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown> & { id: string }; data: { avatar_id: string } }) => {
  const row = rows.get(where.id);
  if (!row || !matches(row, where)) return { count: 0 };
  rows.set(row.id, { ...row, ...data });
  return { count: 1 };
});
const client = { user: { findMany, updateMany } } as unknown as BackfillClient;

const stored = (id: string) => rows.get(id)?.avatar_id;
const fixed = (index: number) => vi.fn((_n: number) => index);
/** An index whose avatar is not `id`'s pseudonym animal, so the random branch is distinguishable. */
const notAnimal = (id: string) => AVATARS.findIndex((a) => a.id !== defaultAvatarFor(id));

beforeEach(() => {
  rows.clear();
  findMany.mockClear();
  updateMany.mockClear();
});

describe("backfillAvatars --apply: which rows get what", () => {
  it("gives an old NULL row without a display name its pseudonym animal (name unchanged)", async () => {
    seed({ id: "old-anon" });
    seed({ id: "old-blank", display_name: "   " });
    const rand = fixed(0);
    const s = await backfillAvatars(client, { apply: true, rand });
    for (const id of ["old-anon", "old-blank"]) {
      expect(stored(id)).toBe(defaultAvatarFor(id));
      expect(climberHandle(id, stored(id))).toBe(climberHandle(id));
    }
    expect(rand).not.toHaveBeenCalled();
    expect(s).toMatchObject({ mode: "apply", scanned: 2, written: 2, skipped: 0, pseudonym: 2, random: 0 });
  });

  it("gives an old NULL row with a custom name the (mocked) random avatar", async () => {
    const index = notAnimal("old-named");
    seed({ id: "old-named", display_name: "Aria" });
    const rand = fixed(index);
    const s = await backfillAvatars(client, { apply: true, rand });
    expect(rand).toHaveBeenCalledWith(AVATARS.length);
    expect(stored("old-named")).toBe(AVATARS[index].id);
    expect(s).toMatchObject({ written: 1, pseudonym: 0, random: 1 });
  });

  it.each<[string, Partial<Row>]>([
    ["created exactly at the cut-off", { createdAt: AVATAR_DEFAULT_SINCE }],
    ["created after the cut-off (an Initials choice)", { createdAt: new Date(AVATAR_DEFAULT_SINCE.getTime() + 1) }],
    ["a picked avatar", { avatar_id: "viking" }],
    ["a retired avatar id", { avatar_id: "retired-avatar" }],
    ["a duel guest", { id: "guest:abc" }],
    ["a deleted-account tombstone", { email: "deleted-x@deleted.invalid" }],
  ])("leaves a row that is %s untouched", async (_label, patch) => {
    const id = patch.id ?? "target";
    for (const display_name of [null, "Aria"]) {
      rows.clear();
      seed({ id, display_name, ...patch });
      const before = stored(id);
      const s = await backfillAvatars(client, { apply: true, rand: fixed(0) });
      expect(stored(id)).toBe(before);
      expect(s.scanned).toBe(0);
    }
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("backfills a row one ms before the cut-off", async () => {
    seed({ id: "edge", createdAt: new Date(AVATAR_DEFAULT_SINCE.getTime() - 1) });
    await backfillAvatars(client, { apply: true });
    expect(stored("edge")).toBe(defaultAvatarFor("edge"));
  });

  it("uses the #147 commit instant in UTC as the cut-off", () => {
    expect(AVATAR_DEFAULT_SINCE.toISOString()).toBe("2026-09-25T17:25:59.000Z");
  });
});

describe("backfillAvatars: safety", () => {
  it("dry run (the default mode) writes nothing but reports what it would do", async () => {
    seed({ id: "a" });
    seed({ id: "b", display_name: "Aria" });
    const s = await backfillAvatars(client, { apply: false, rand: fixed(0) });
    expect(updateMany).not.toHaveBeenCalled();
    expect(stored("a")).toBeNull();
    expect(stored("b")).toBeNull();
    expect(s).toMatchObject({ mode: "dry-run", scanned: 2, written: 0, skipped: 0, pseudonym: 1, random: 1 });
    expect(s.sample).toEqual([
      { id: "a", hasDisplayName: false, avatarId: defaultAvatarFor("a") },
      { id: "b", hasDisplayName: true, avatarId: AVATARS[0].id },
    ]);
  });

  it("never puts an email or display name in the report", async () => {
    seed({ id: "a", email: "secret@example.com", display_name: "Private Name" });
    const s = await backfillAvatars(client, { apply: false });
    const text = JSON.stringify(s);
    expect(text).not.toContain("secret@example.com");
    expect(text).not.toContain("Private Name");
  });

  it("is idempotent: a second run scans and writes nothing, and never re-rolls", async () => {
    seed({ id: "a" });
    seed({ id: "b", display_name: "Aria" });
    await backfillAvatars(client, { apply: true, rand: fixed(1) });
    const first = new Map([...rows].map(([k, r]) => [k, r.avatar_id]));
    updateMany.mockClear();
    const rand = fixed(2);
    const s = await backfillAvatars(client, { apply: true, rand });
    expect(s).toMatchObject({ scanned: 0, written: 0 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(rand).not.toHaveBeenCalled();
    expect(new Map([...rows].map(([k, r]) => [k, r.avatar_id]))).toEqual(first);
  });

  it("skips (does not overwrite) a row whose avatar was saved between scan and write", async () => {
    seed({ id: "a" });
    findMany.mockImplementationOnce(async () => {
      rows.set("a", { ...rows.get("a")!, avatar_id: "wolf" });
      return [{ id: "a", display_name: null }];
    });
    const s = await backfillAvatars(client, { apply: true });
    expect(stored("a")).toBe("wolf");
    expect(s).toMatchObject({ scanned: 1, written: 0, skipped: 1 });
  });

  it("skips a row whose display name changed between scan and write", async () => {
    seed({ id: "a", display_name: "Aria" });
    findMany.mockImplementationOnce(async () => {
      rows.set("a", { ...rows.get("a")!, display_name: null });
      return [{ id: "a", display_name: "Aria" }];
    });
    const s = await backfillAvatars(client, { apply: true, rand: fixed(notAnimal("a")) });
    expect(stored("a")).toBeNull();
    expect(s).toMatchObject({ written: 0, skipped: 1 });
  });

  it("pages through the table in id order and reaches every eligible row", async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `u${i}`);
    for (const id of ids) seed({ id });
    seed({ id: "guest:zz" });
    const s = await backfillAvatars(client, { apply: false, batchSize: 3 });
    expect(s.scanned).toBe(ids.length);
    expect(findMany).toHaveBeenCalledTimes(3);
    const second = findMany.mock.calls[1][0] as { where: { id?: { gt: string } } };
    expect(second.where.id).toEqual({ gt: "u2" });
  });

  it("pages correctly in apply mode, where written rows leave the result set", async () => {
    for (let i = 0; i < 5; i++) seed({ id: `u${i}` });
    const s = await backfillAvatars(client, { apply: true, batchSize: 2 });
    expect(s).toMatchObject({ scanned: 5, written: 5 });
    for (let i = 0; i < 5; i++) expect(stored(`u${i}`)).toBe(defaultAvatarFor(`u${i}`));
  });

  it.each([0, -1, 1.5])("rejects batch size %s", async (batchSize) => {
    await expect(backfillAvatars(client, { apply: false, batchSize })).rejects.toThrow(RangeError);
  });
});

describe("randomAvatarId", () => {
  it("reaches every catalogue index, each a valid catalogue id", () => {
    const seen = new Set<string>();
    for (let i = 0; i < AVATARS.length; i++) {
      const id = randomAvatarId(() => i);
      expect(id).toBe(AVATARS[i].id);
      expect(parseAvatarId(id)).toBe(id);
      seen.add(id);
    }
    expect(seen.size).toBe(AVATARS.length);
  });

  it("uses crypto.randomInt by default and always returns a catalogue id", () => {
    for (let i = 0; i < 200; i++) {
      const id = randomAvatarId();
      expect(parseAvatarId(id)).toBe(id);
    }
  });

  it.each([-1, AVATARS.length, 1.5, Number.NaN])("throws on an out-of-range index %s", (bad) => {
    expect(() => randomAvatarId(() => bad)).toThrow(RangeError);
  });
});

describe("backfillAvatarFor", () => {
  it.each([null, "", "   "])("gives no display name (%j) the pseudonym's animal without rolling", (name) => {
    const rand = fixed(0);
    expect(backfillAvatarFor("uid-1", name, rand)).toBe(defaultAvatarFor("uid-1"));
    expect(rand).not.toHaveBeenCalled();
  });

  it("gives a display name the random pick", () => {
    const last = AVATARS.length - 1;
    expect(backfillAvatarFor("uid-1", "Aria", () => last)).toBe(AVATARS[last].id);
  });
});
