/**
 * ensureUser creates a NEW account with no avatar (the initials badge,
 * climbing as the Green Stick): every character is earned or premium, so none
 * is handed out. It runs on every sign-in, so the update branch must never
 * touch avatar_id: a picked avatar (including a starter animal given before
 * this change), a cleared one, and an existing account with none all survive.
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
import { climberHandle, climberDisplay } from "../../src/lib/handle";

beforeEach(() => {
  users.clear();
  upsert.mockClear();
});

describe("ensureUser default avatar", () => {
  it.each(["uid-1", "firebase-uid-abc", "zQ9xLm2PqR7sT4vW"])(
    "creates %j with no avatar, named by its hash pseudonym",
    async (id) => {
      await ensureUser({ id, email: `${id}@e.com`, emailVerified: true });
      expect(users.get(id)).toBeDefined();
      const avatar = users.get(id)!.avatar_id as string | null;
      expect(avatar).toBeNull();
      expect(climberDisplay(id, null, avatar)).toBe(climberHandle(id));
    }
  );

  it("keeps a starter animal given before this change on a later sign-in", async () => {
    users.set("old-starter", { id: "old-starter", email: "s@e.com", emailVerified: false, avatar_id: "otter" });
    await ensureUser({ id: "old-starter", email: "s@e.com", emailVerified: true });
    expect(users.get("old-starter")?.avatar_id).toBe("otter");
  });

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

  it("sets avatar_id in neither create nor update", async () => {
    await ensureUser({ id: "uid-1", email: "a@e.com" });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [args] = upsert.mock.calls[0];
    expect(Object.keys(args.create)).not.toContain("avatar_id");
    expect(Object.keys(args.update)).not.toContain("avatar_id");
  });
});

describe("ensureGuestUser", () => {
  it("creates the guest row with no avatar", async () => {
    await ensureGuestUser("guest:abc");
    expect(users.get("guest:abc")?.avatar_id).toBeNull();
  });
});
