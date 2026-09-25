/**
 * topFreeClimbers carries each climber's avatar to the Ranks screen. A stored
 * id is only trusted if it is still in the catalogue: a retired (or otherwise
 * unknown) id must come back as null so the app falls back to initials. The
 * fake honours the query's `select`, so dropping `avatar_id` from it would
 * null every avatar and fail here.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

interface FakeUser {
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
}

const { rows, findMany } = vi.hoisted(() => {
  const rows: Array<{ userId: string; peak_y: number; wins: number; user: FakeUser }> = [];
  const findMany = vi.fn(
    async ({ select }: { select: { user: { select: Partial<Record<keyof FakeUser, boolean>> } } }) =>
      [...rows]
        .sort((a, b) => b.peak_y - a.peak_y)
        .map((r) => ({
          userId: r.userId,
          peak_y: r.peak_y,
          wins: r.wins,
          user: Object.fromEntries(
            Object.entries(r.user).filter(([k]) => select.user.select[k as keyof FakeUser])
          ),
        }))
  );
  return { rows, findMany };
});

vi.mock("../../src/db/client", () => ({
  prisma: { climbRecord: { findMany } },
}));

import { topFreeClimbers } from "../../src/db/climb";
import { AVATARS } from "../../src/lib/avatars";

describe("topFreeClimbers avatars", () => {
  it("maps a stored catalogue id through, and a retired or missing one to null", async () => {
    rows.push(
      { userId: "has-avatar", peak_y: 900, wins: 0, user: { display_name: "A", username: null, avatar_id: AVATARS[0].id } },
      { userId: "retired", peak_y: 800, wins: 0, user: { display_name: "B", username: null, avatar_id: "retired-avatar" } },
      { userId: "proto", peak_y: 700, wins: 0, user: { display_name: "C", username: null, avatar_id: "__proto__" } },
      { userId: "none", peak_y: 600, wins: 0, user: { display_name: "D", username: null, avatar_id: null } }
    );

    const board = await topFreeClimbers(50);

    expect(board.map((c) => [c.userId, c.avatarId])).toEqual([
      ["has-avatar", AVATARS[0].id],
      ["retired", null],
      ["proto", null],
      ["none", null],
    ]);
  });
});
