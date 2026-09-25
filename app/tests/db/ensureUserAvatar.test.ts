/**
 * ensureUser gives a NEW account the avatar matching its pseudonym's animal,
 * so its default picture and default name agree. It runs on every sign-in, so
 * the update branch must never touch avatar_id: a picked avatar, a cleared
 * one, and an existing account with none (no backfill) all survive it.
 *
 * The fake applies Prisma's upsert semantics to an in-memory table: `create`
 * when the row is missing, else `update` merged onto the stored row. An
 * avatar_id in `update` therefore overwrites the stored value, as it would in
 * Postgres.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const { users, upsert } = vi.hoisted(() => {
  const users = new Map<string, Row>();
  const upsert = vi.fn(
    async ({
      where,
      create,
      update,
    }: {
      where: { id: string };
      create: Row;
      update: Record<string, unknown>;
    }) => {
      const existing = users.get(where.id);
      const next: Row = existing ? { ...existing, ...update } : { avatar_id: null, ...create };
      users.set(where.id, next);
      return next;
    }
  );
  return { users, upsert };
});

vi.mock("../../src/db/client", () => ({ prisma: { user: { upsert } } }));

import { ensureUser, ensureGuestUser } from "../../src/db/user";
import { climberHandle, defaultAvatarFor } from "../../src/lib/handle";
import { parseAvatarId } from "../../src/lib/avatars";

beforeEach(() => {
  users.clear();
  upsert.mockClear();
});

describe("ensureUser default avatar", () => {
  it.each(["uid-1", "firebase-uid-abc", "zQ9xLm2PqR7sT4vW"])(
    "creates %j with the avatar of its pseudonym's animal",
    async (id) => {
      await ensureUser({ id, email: `${id}@e.com`, emailVerified: true });
      const avatar = users.get(id)?.avatar_id;
      expect(avatar).toBe(defaultAvatarFor(id));
      expect(parseAvatarId(avatar)).toBe(avatar);
      // The name the new account is shown under is unchanged by the default.
      expect(climberHandle(id, avatar as string)).toBe(climberHandle(id));
    }
  );

  it("never changes a picked avatar on a later sign-in", async () => {
    await ensureUser({ id: "uid-1", email: "a@e.com" });
    users.set("uid-1", { ...users.get("uid-1")!, avatar_id: "wraith" });

    await ensureUser({ id: "uid-1", email: "a@e.com", emailVerified: true });

    expect(users.get("uid-1")?.avatar_id).toBe("wraith");
    expect(users.get("uid-1")?.emailVerified).toBe(true);
  });

  it("never re-fills a cleared avatar, nor backfills an existing account", async () => {
    users.set("old-account", { id: "old-account", email: "o@e.com", emailVerified: false, avatar_id: null });

    await ensureUser({ id: "old-account", email: "o@e.com", emailVerified: true });

    expect(users.get("old-account")?.avatar_id).toBeNull();
  });

  it("puts avatar_id in create only, never in update", async () => {
    await ensureUser({ id: "uid-1", email: "a@e.com" });
    const [args] = upsert.mock.calls[0];
    expect(args.create.avatar_id).toBe(defaultAvatarFor("uid-1"));
    expect(Object.keys(args.update)).not.toContain("avatar_id");
  });
});

describe("ensureGuestUser", () => {
  it("creates the guest row with no avatar", async () => {
    await ensureGuestUser("guest:abc");
    expect(users.get("guest:abc")?.avatar_id).toBeNull();
  });
});
