/**
 * Admin list_climb_replays backing query + dispatch routing.
 *
 * listAllClimbReplays powers the admin agent tool that discovers replay tokens
 * across ALL users to feed into analyze_climb_replay. These tests invoke the
 * real units (no source grepping): the DB helper against a faked prisma, and
 * dispatchTool("list_climb_replays", …) end-to-end through the closed tool set.
 *
 * The fake `findMany` honors BOTH orderBy keys and the composite (created_at,
 * id) keyset OR-clause, so the same-millisecond page-boundary test proves the
 * production paging logic — not a mock that happens to agree with it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeRun {
  id: string;
  userId: string | null;
  peak_y: number;
  category_slug: string;
  created_at: Date;
  replay_token: string | null;
  user: { display_name: string | null } | null;
}

type IdFilter = { lt: string };
type DateFilter = { lt: Date };
interface WhereBranch {
  created_at?: Date | DateFilter;
  id?: IdFilter;
}
interface Where {
  replay_token?: { not: null };
  OR?: WhereBranch[];
}
interface FindManyArgs {
  where: Where;
  orderBy: Array<{ created_at?: "desc"; id?: "desc" }>;
  take: number;
}

const { findMany, state } = vi.hoisted(() => {
  // Two distinct users + a null-user (SetNull) row, plus one run WITHOUT a
  // replay token that must never surface. Intentionally unsorted.
  const base: FakeRun[] = [
    {
      id: "run-old",
      userId: "u-1",
      peak_y: 120,
      category_slug: "free-stack",
      created_at: new Date("2026-01-01T00:00:00Z"),
      replay_token: "tok-old",
      user: { display_name: "Aria" },
    },
    {
      id: "run-new",
      userId: "u-2",
      peak_y: 800,
      category_slug: "free-stack",
      created_at: new Date("2026-03-01T00:00:00Z"),
      replay_token: "tok-new",
      user: { display_name: null },
    },
    {
      id: "run-mid",
      userId: null,
      peak_y: 300,
      category_slug: "free-stack",
      created_at: new Date("2026-02-01T00:00:00Z"),
      replay_token: "tok-mid",
      user: null,
    },
    {
      id: "run-notoken",
      userId: "u-3",
      peak_y: 999,
      category_slug: "free-stack",
      created_at: new Date("2026-04-01T00:00:00Z"),
      replay_token: null,
      user: { display_name: "NoReplay" },
    },
  ];

  const state = { rows: base as FakeRun[], base };

  const matchesBranch = (r: FakeRun, b: WhereBranch): boolean => {
    if (b.created_at !== undefined) {
      if (b.created_at instanceof Date) {
        if (r.created_at.getTime() !== b.created_at.getTime()) return false;
      } else if (r.created_at.getTime() >= b.created_at.lt.getTime()) {
        return false;
      }
    }
    if (b.id !== undefined && !(r.id < b.id.lt)) return false;
    return true;
  };

  const findMany = vi.fn(async (args: FindManyArgs) => {
    const requiresToken = args.where.replay_token?.not === null;
    const or = args.where.OR;
    return state.rows
      .filter((r) => !requiresToken || r.replay_token !== null)
      .filter((r) => (or ? or.some((b) => matchesBranch(r, b)) : true))
      // orderBy [{ created_at: desc }, { id: desc }]
      .sort((a, b) =>
        b.created_at.getTime() - a.created_at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
      )
      .slice(0, args.take)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        peak_y: r.peak_y,
        category_slug: r.category_slug,
        created_at: r.created_at,
        replay_token: r.replay_token,
        user: r.user,
      }));
  });

  return { findMany, state };
});

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("../../src/db/client", () => ({
  prisma: { climbRun: { findMany } },
}));

import { listAllClimbReplays, ADMIN_REPLAY_MAX_LIMIT } from "../../src/db/climb";
import { dispatchTool } from "../../src/social/agent/dispatch";

beforeEach(() => {
  findMany.mockClear();
  state.rows = state.base;
});

describe("listAllClimbReplays", () => {
  it("returns replays across multiple users, newest first", async () => {
    const rows = await listAllClimbReplays({ limit: 30 });
    expect(rows.map((r) => r.id)).toEqual(["run-new", "run-mid", "run-old"]);
  });

  it("only returns runs that HAVE a replay token", async () => {
    const rows = await listAllClimbReplays({ limit: 30 });
    expect(rows.map((r) => r.id)).not.toContain("run-notoken");
    expect(rows.every((r) => r.replayToken.length > 0)).toBe(true);
    const call = findMany.mock.calls.at(-1)![0] as { where: { replay_token?: unknown } };
    expect(call.where.replay_token).toEqual({ not: null });
  });

  it("includes a display name (profile name, else pseudonym) and the token", async () => {
    const rows = await listAllClimbReplays({ limit: 30 });
    const named = rows.find((r) => r.id === "run-old")!;
    expect(named.displayName).toBe("Aria");
    expect(named.replayToken).toBe("tok-old");
    // display_name null -> deterministic non-empty pseudonym, never blank/email.
    const anon = rows.find((r) => r.id === "run-new")!;
    expect(anon.displayName.length).toBeGreaterThan(0);
    expect(anon.displayName).not.toBe("Aria");
  });

  it("does not egress the raw internal userId in the output shape", async () => {
    const rows = await listAllClimbReplays({ limit: 30 });
    for (const r of rows) {
      expect(Object.prototype.hasOwnProperty.call(r, "userId")).toBe(false);
    }
    // Keys are exactly the minimized set.
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["categorySlug", "createdAt", "displayName", "id", "peakY", "replayToken"].sort()
    );
  });

  it("orders by (created_at desc, id desc) to make paging stable", async () => {
    await listAllClimbReplays({ limit: 30 });
    const call = findMany.mock.calls.at(-1)![0] as { orderBy: unknown };
    expect(call.orderBy).toEqual([{ created_at: "desc" }, { id: "desc" }]);
  });

  it("clamps the limit to the max cap", async () => {
    await listAllClimbReplays({ limit: 10_000 });
    const call = findMany.mock.calls.at(-1)![0] as { take: number };
    expect(call.take).toBe(ADMIN_REPLAY_MAX_LIMIT);
  });

  it("floors the limit to at least 1", async () => {
    await listAllClimbReplays({ limit: 0 });
    const call = findMany.mock.calls.at(-1)![0] as { take: number };
    expect(call.take).toBe(1);
  });

  it("keeps replay_token != null AND-ed across every keyset OR branch", async () => {
    await listAllClimbReplays({ limit: 30, before: { createdAt: new Date("2026-02-15T00:00:00Z"), id: "z" } });
    const call = findMany.mock.calls.at(-1)![0] as {
      where: { replay_token?: unknown; OR?: unknown[] };
    };
    expect(call.where.replay_token).toEqual({ not: null });
    expect(Array.isArray(call.where.OR)).toBe(true);
    expect(call.where.OR).toHaveLength(2);
  });
});

describe("dispatchTool('list_climb_replays')", () => {
  it("routes to the handler and returns replays for an admin ctx", async () => {
    const result = await dispatchTool("list_climb_replays", { limit: 30 }, { uid: "admin-1" });
    expect(result.status).toBe("SUCCEEDED");
    const output = result.output as { replays: { id: string }[]; nextBefore: string | null };
    expect(output.replays.map((r) => r.id)).toEqual(["run-new", "run-mid", "run-old"]);
    // Short page (3 < 30) => no further cursor.
    expect(output.nextBefore).toBeNull();
  });

  it("pages two same-millisecond replays across a boundary without skipping either", async () => {
    // Both tie rows share the EXACT same created_at — the case a created_at-only
    // strict `<` cursor would silently skip one of.
    const tie = new Date("2026-05-01T00:00:00Z");
    state.rows = [
      {
        id: "tie-a",
        userId: "u-9",
        peak_y: 10,
        category_slug: "free-stack",
        created_at: tie,
        replay_token: "tok-tie-a",
        user: { display_name: "Zed" },
      },
      {
        id: "tie-b",
        userId: "u-8",
        peak_y: 20,
        category_slug: "free-stack",
        created_at: tie,
        replay_token: "tok-tie-b",
        user: { display_name: "Yan" },
      },
    ];

    const page1 = await dispatchTool("list_climb_replays", { limit: 1 }, { uid: "admin-1" });
    const out1 = page1.output as { replays: { id: string }[]; nextBefore: string | null };
    expect(out1.replays).toHaveLength(1);
    expect(out1.nextBefore).not.toBeNull();

    const page2 = await dispatchTool(
      "list_climb_replays",
      { limit: 1, before: out1.nextBefore! },
      { uid: "admin-1" }
    );
    const out2 = page2.output as { replays: { id: string }[]; nextBefore: string | null };
    expect(out2.replays).toHaveLength(1);

    const seen = [...out1.replays, ...out2.replays].map((r) => r.id);
    // Both tokens surface, neither skipped, neither duplicated.
    expect(new Set(seen)).toEqual(new Set(["tie-a", "tie-b"]));
    expect(seen).toHaveLength(2);
  });

  it("returns VALIDATION_ERROR for a malformed `before` cursor, without a DB read", async () => {
    findMany.mockClear();
    const result = await dispatchTool("list_climb_replays", { before: "not-a-cursor" }, { uid: "admin-1" });
    expect(result.status).toBe("FAILED");
    const output = result.output as { reason: string; detail: string };
    expect(output.reason).toBe("VALIDATION_ERROR");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("refuses to run without an admin identity", async () => {
    findMany.mockClear();
    const result = await dispatchTool("list_climb_replays", { limit: 30 }, { uid: "" });
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toMatch(/authenticated admin/);
    // The guard fires before any DB read.
    expect(findMany).not.toHaveBeenCalled();
  });
});
