/**
 * echoedSetting: the one server-truth rule for single-field PUT /api/settings
 * writes on the mobile SPA (the avatar picker and Edit Profile's visibility
 * toggle both call it). A 200 counts as saved only if the body has its own
 * field for the key and that field parses to the value sent.
 */

import { describe, expect, it } from "vitest";
import { AVATARS } from "@app/lib/avatars";
import { echoedSetting, settingsFromResponse } from "../../mobile/src/contexts/AppDataContext";

const [FIRST, SECOND] = AVATARS;

const body = (over: Record<string, unknown> = {}) => ({
  displayName: "Aria Stone",
  username: "aria",
  social: {},
  leaderboardConsent: true,
  avatarId: FIRST.id,
  ...over,
});

describe("echoedSetting", () => {
  it("returns the normalised settings when the body echoes the value sent", () => {
    const b = body({ leaderboardConsent: false });
    expect(echoedSetting(b, "leaderboardConsent", false)).toEqual(settingsFromResponse(b));
    expect(echoedSetting(body(), "avatarId", FIRST.id)?.avatarId).toBe(FIRST.id);
  });

  it("accepts an echoed null avatar for Use initials", () => {
    expect(echoedSetting(body({ avatarId: null }), "avatarId", null)?.avatarId).toBeNull();
  });

  it("rejects a body with no field for the key, even when the default would match", () => {
    const { leaderboardConsent: _c, ...noConsent } = body();
    const { avatarId: _a, ...noAvatar } = body();
    // settingsFromResponse coerces the missing fields to the values sent below.
    expect(settingsFromResponse(noConsent)?.leaderboardConsent).toBe(false);
    expect(settingsFromResponse(noAvatar)?.avatarId).toBeNull();
    expect(echoedSetting(noConsent, "leaderboardConsent", false)).toBeNull();
    expect(echoedSetting(noAvatar, "avatarId", null)).toBeNull();
  });

  it("rejects a field that is only inherited through the prototype", () => {
    const inherited: object = Object.create({ leaderboardConsent: false, avatarId: SECOND.id });
    expect(echoedSetting(inherited, "leaderboardConsent", false)).toBeNull();
    expect(echoedSetting(inherited, "avatarId", SECOND.id)).toBeNull();
    // JSON.parse makes "__proto__" an own key; the setting inside it is not one.
    const parsed: unknown = JSON.parse('{"__proto__": {"leaderboardConsent": false}}');
    expect(echoedSetting(parsed, "leaderboardConsent", false)).toBeNull();
  });

  it("rejects a body that stored a different value", () => {
    expect(echoedSetting(body({ leaderboardConsent: true }), "leaderboardConsent", false)).toBeNull();
    expect(echoedSetting(body({ avatarId: SECOND.id }), "avatarId", FIRST.id)).toBeNull();
    expect(echoedSetting(body({ avatarId: FIRST.id }), "avatarId", null)).toBeNull();
  });

  it("rejects a body that is not an object", () => {
    for (const b of [null, undefined, "ok", 200, true]) {
      expect(echoedSetting(b, "leaderboardConsent", false)).toBeNull();
    }
    expect(echoedSetting([], "avatarId", null)).toBeNull();
  });
});
