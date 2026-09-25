/**
 * publicUserJson is the one projection friends, challenge and user-search
 * payloads share. It must emit exactly the four public fields, in the order the
 * friends and challenge payloads always had, and allow-list the avatar column.
 */

import { describe, expect, it } from "vitest";
import { publicUserJson, publicUserSelect, type PublicUserRow } from "../../src/db/publicUser";

const ROW: PublicUserRow = { id: "u1", display_name: "Aria", username: "aria", avatar_id: "wolf" };

describe("publicUserJson", () => {
  it("maps a selected row to the public JSON shape", () => {
    expect(JSON.stringify(publicUserJson(ROW))).toBe(
      '{"id":"u1","displayName":"Aria","username":"aria","avatarId":"wolf"}',
    );
  });

  it("drops any column beyond the public four, even when the row carries it", () => {
    const wide = { ...ROW, email: "aria@example.test", emailVerified: true };
    expect(Object.keys(publicUserJson(wide))).toEqual(["id", "displayName", "username", "avatarId"]);
  });

  it.each(["retired-id", "WOLF", "wolf ", "__proto__", "toString", ""])(
    "returns avatarId null for a non-catalogue avatar column %j",
    (avatar_id) => {
      expect(publicUserJson({ ...ROW, avatar_id }).avatarId).toBeNull();
    },
  );

  it("keeps null fields null", () => {
    expect(publicUserJson({ id: "u2", display_name: null, username: null, avatar_id: null })).toEqual({
      id: "u2",
      displayName: null,
      username: null,
      avatarId: null,
    });
  });

  it("selects exactly the columns the mapping reads", () => {
    expect(Object.keys(publicUserSelect).sort()).toEqual(["avatar_id", "display_name", "id", "username"]);
  });
});
