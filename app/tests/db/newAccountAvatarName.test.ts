/**
 * A new account's name and picture agree, end to end: the real ensureUser
 * creates the row, and the real board reads (topFreeClimbers,
 * getUserFreeClimbRecord) name it and hand the picture id to the client. The
 * name's animal must be the animal in the picture, and it must be the same
 * pseudonym the id alone gave before avatars could rename anyone.
 *
 * Later sign-ins run ensureUser again. A pick (animal or not), a cleared
 * avatar, and a retired id stored in the column must each survive it, and the
 * row's name and picture must still agree.
 *
 * The fake applies Prisma's upsert semantics (create when missing, else merge
 * `update` onto the stored row) to the same in-memory users table that the
 * board reads project through their own `select`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../../src/db/client", async () => {
  const { fakePrisma, db } = await import("../api/fakeSocialPrisma");
  type Row = (typeof db.users extends Map<string, infer U> ? U : never) & Record<string, unknown>;
  const upsert = async ({
    where,
    create,
    update,
  }: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) => {
    const existing = db.users.get(where.id) as Row | undefined;
    const next = (
      existing
        ? { ...existing, ...update }
        : { display_name: null, username: null, avatar_id: null, leaderboard_consent_at: new Date(0), ...create }
    ) as Row;
    db.users.set(where.id, next);
    return next;
  };
  return { prisma: { ...fakePrisma, user: { ...fakePrisma.user, upsert } } };
});

import { ensureUser } from "../../src/db/user";
import { getUserFreeClimbRecord, topFreeClimbers } from "../../src/db/climb";
import { ANIMALS, climberHandle } from "../../src/lib/handle";
import { avatarName } from "../../src/lib/avatars";
import { FREE_STACK_SLUG } from "../../src/game/freeStack";
import { db, resetDb } from "../api/fakeSocialPrisma";

const ANIMAL_WORDS: readonly string[] = ANIMALS;

async function signIn(id: string): Promise<void> {
  await ensureUser({ id, email: `${id}@e.com`, emailVerified: true });
}

function climb(id: string, peak = 500): void {
  db.records.push({ userId: id, category_slug: FREE_STACK_SLUG, peak_y: peak, wins: 0, updated_at: new Date(0) });
}

async function boardRow(id: string) {
  const row = (await topFreeClimbers(1000)).find((c) => c.userId === id);
  expect(row).toBeDefined();
  return row!;
}

/** The animal word in "Adjective Animal NN". */
const animalOf = (handle: string) => handle.split(" ")[1];

/** The picture's animal word, or null for a non-animal avatar or initials. */
function pictureAnimal(avatarId: string | null): string | null {
  const name = avatarName(avatarId);
  return name !== null && ANIMAL_WORDS.includes(name) ? name : null;
}

beforeEach(() => {
  resetDb();
});

describe("a new account", () => {
  it("shows the same animal in its board name and its picture, for every animal a new account can get", async () => {
    const ids = Array.from({ length: 160 }, (_, i) => `new-account-${i}-${i * 104729}`);
    const animalsSeen = new Set<string>();
    let checked = 0;
    for (const id of ids) {
      await signIn(id);
      climb(id);
    }
    const board = new Map((await topFreeClimbers(1000)).map((c) => [c.userId, c]));
    for (const id of ids) {
      const row = board.get(id);
      expect(row).toBeDefined();
      const picture = pictureAnimal(row!.avatarId);
      expect(picture).not.toBeNull();
      expect(animalOf(row!.handle)).toBe(picture);
      // The default avatar never renames a new player: same pseudonym as the id alone.
      expect(row!.handle).toBe(climberHandle(id));
      // The dashboard record names them the same way.
      expect((await getUserFreeClimbRecord(id))?.handle).toBe(row!.handle);
      animalsSeen.add(picture!);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // Every one of the 16 hash animals was a default here, so none of them is unguarded.
    expect(animalsSeen.size).toBe(ANIMALS.length);
  });
});

describe("a later sign-in keeps the pick, and name and picture still agree", () => {
  const ID = "returning-player-3";

  it("an animal pick renames the pseudonym to that animal", async () => {
    await signIn(ID);
    climb(ID);
    const pick = ANIMALS.find((a) => a !== animalOf(climberHandle(ID)))!.toLowerCase();
    db.users.set(ID, { ...db.users.get(ID)!, avatar_id: pick });

    await signIn(ID);

    const row = await boardRow(ID);
    expect(row.avatarId).toBe(pick);
    expect(animalOf(row.handle)).toBe(pictureAnimal(row.avatarId));
    expect(row.handle).toBe(climberHandle(ID, pick));
    expect(row.handle).not.toBe(climberHandle(ID));
    // The dashboard record (Profile header source) names them the same way.
    expect((await getUserFreeClimbRecord(ID))?.handle).toBe(row.handle);
  });

  it.each(["wraith", "viking", "sentinel"])("the non-animal %s keeps the hash pseudonym", async (pick) => {
    await signIn(ID);
    climb(ID);
    db.users.set(ID, { ...db.users.get(ID)!, avatar_id: pick });

    await signIn(ID);

    const row = await boardRow(ID);
    expect(row.avatarId).toBe(pick);
    expect(row.handle).toBe(climberHandle(ID));
  });

  it("a cleared avatar stays cleared (initials) with the hash pseudonym", async () => {
    await signIn(ID);
    climb(ID);
    db.users.set(ID, { ...db.users.get(ID)!, avatar_id: null });

    await signIn(ID);

    const row = await boardRow(ID);
    expect(row.avatarId).toBeNull();
    expect(row.handle).toBe(climberHandle(ID));
  });

  it("a retired id in the column shows initials and the hash pseudonym", async () => {
    await signIn(ID);
    climb(ID);
    db.users.set(ID, { ...db.users.get(ID)!, avatar_id: "retired-avatar" });

    await signIn(ID);

    expect(db.users.get(ID)?.avatar_id).toBe("retired-avatar");
    const row = await boardRow(ID);
    expect(row.avatarId).toBeNull();
    expect(row.handle).toBe(climberHandle(ID));
  });

  it("an account that predates default avatars is not backfilled", async () => {
    db.users.set(ID, {
      id: ID,
      display_name: null,
      username: null,
      avatar_id: null,
      leaderboard_consent_at: new Date(0),
    });
    climb(ID);

    await signIn(ID);

    const row = await boardRow(ID);
    expect(row.avatarId).toBeNull();
    expect(row.handle).toBe(climberHandle(ID));
  });
});
