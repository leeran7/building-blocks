/**
 * Telegram Mini App initData verification (src/api/telegramInitData.ts):
 * only launch data signed for this bot, fresh, and carrying a well-formed
 * user id signs anyone in. Fixtures are signed from Telegram's spec
 * (fixtures.ts), not with the production helper.
 */

import { describe, expect, it, vi } from "vitest";

// platformAuth (the uid format check) imports Firebase Admin, which needs credentials.
vi.mock("../../src/lib/firebaseAdmin", () => ({ adminAuth: {} }));
vi.mock("../../src/db/user", () => ({ ensurePlatformUser: vi.fn() }));

import {
  INIT_DATA_FUTURE_SKEW_SECONDS,
  INIT_DATA_MAX_AGE_SECONDS,
  verifyTelegramInitData,
} from "../../src/api/telegramInitData";
import { NOW, OTHER_BOT_TOKEN, signInitData, TEST_BOT_TOKEN, TG_USER_ID, userJson, validFields } from "./fixtures";

const verify = (initData: unknown, now = NOW) => verifyTelegramInitData(initData, TEST_BOT_TOKEN, now);
const refusalOf = (initData: unknown, now = NOW) => {
  const r = verify(initData, now);
  return r.ok ? "accepted" : r.refusal;
};

describe("verifyTelegramInitData", () => {
  it("accepts launch data Telegram signed for this bot, with the user id from the signed user", () => {
    const r = verify(signInitData(validFields()));
    expect(r).toEqual({ ok: true, telegramUserId: String(TG_USER_ID), authDate: NOW - 60 });
  });

  it("accepts a launch with only the required fields", () => {
    const initData = signInitData({ user: userJson(), auth_date: String(NOW) });
    expect(refusalOf(initData)).toBe("accepted");
  });

  it("refuses data signed with another bot's token", () => {
    expect(refusalOf(signInitData(validFields(), OTHER_BOT_TOKEN))).toBe("BAD_HASH");
  });

  it("refuses a forged hash of the right shape", () => {
    const params = new URLSearchParams(signInitData(validFields()));
    params.set("hash", "0".repeat(64));
    expect(refusalOf(params.toString())).toBe("BAD_HASH");
  });

  it.each([
    ["the user id", "user", userJson(TG_USER_ID + 1)],
    ["auth_date", "auth_date", String(NOW - 30)],
    ["query_id", "query_id", "AAAAAAAAAAAAAAAAAAAAAAAA"],
  ])("refuses a launch whose %s was changed after signing", (_label, key, value) => {
    const params = new URLSearchParams(signInitData(validFields()));
    params.set(key, value);
    expect(refusalOf(params.toString())).toBe("BAD_HASH");
  });

  it("refuses a field added after signing", () => {
    const params = new URLSearchParams(signInitData(validFields()));
    params.set("start_param", "free-gems");
    expect(refusalOf(params.toString())).toBe("BAD_HASH");
  });

  it("refuses a launch older than the freshness window, and accepts one right at it", () => {
    const authDate = NOW - 60;
    const initData = signInitData(validFields());
    expect(refusalOf(initData, authDate + INIT_DATA_MAX_AGE_SECONDS)).toBe("accepted");
    expect(refusalOf(initData, authDate + INIT_DATA_MAX_AGE_SECONDS + 1)).toBe("EXPIRED");
  });

  it("refuses an auth_date in the future beyond clock skew, and allows small skew", () => {
    const ahead = (s: number) => signInitData(validFields({ auth_date: String(NOW + s) }));
    expect(refusalOf(ahead(INIT_DATA_FUTURE_SKEW_SECONDS))).toBe("accepted");
    expect(refusalOf(ahead(INIT_DATA_FUTURE_SKEW_SECONDS + 1))).toBe("FUTURE");
  });

  it("refuses signed data with no user", () => {
    const fields = validFields();
    delete (fields as Partial<Record<string, string>>).user;
    expect(refusalOf(signInitData(fields))).toBe("NO_USER");
  });

  it.each([
    ["a string id", userJson("987654321")],
    ["a zero id", userJson(0)],
    ["a negative id", userJson(-5)],
    ["a fractional id", userJson(1.5)],
    ["an unsafe integer id", userJson(2 ** 60)],
    ["no id", JSON.stringify({ first_name: "Ada" })],
    ["an id only under __proto__", '{"__proto__":{"id":5}}'],
    ["an array", "[1]"],
    ["null", "null"],
    ["not JSON", "{id:5"],
  ])("refuses a signed user with %s", (_label, user) => {
    expect(refusalOf(signInitData(validFields({ user })))).toBe("BAD_USER");
  });

  it.each([
    ["a number", 5],
    ["undefined", undefined],
    ["an empty string", ""],
    ["an object", { initData: "x" }],
  ])("refuses initData that is %s", (_label, v) => {
    expect(refusalOf(v)).toBe("MISSING");
  });

  it("refuses data with no hash, an upper-case hash, or a repeated key", () => {
    const signed = new URLSearchParams(signInitData(validFields()));
    const hash = signed.get("hash")!;

    const noHash = new URLSearchParams(signed);
    noHash.delete("hash");
    expect(refusalOf(noHash.toString())).toBe("MALFORMED");

    const upper = new URLSearchParams(signed);
    upper.set("hash", hash.toUpperCase());
    expect(refusalOf(upper.toString())).toBe("MALFORMED");

    expect(refusalOf(`${signed.toString()}&user=${encodeURIComponent(userJson(1))}`)).toBe("MALFORMED");
  });

  it("refuses a signed auth_date that is not whole seconds", () => {
    expect(refusalOf(signInitData(validFields({ auth_date: "1.76e9" })))).toBe("MALFORMED");
    expect(refusalOf(signInitData(validFields({ auth_date: "" })))).toBe("MALFORMED");
  });

  it("refuses an oversized blob before hashing it", () => {
    expect(refusalOf(signInitData(validFields({ query_id: "a".repeat(5000) })))).toBe("MALFORMED");
  });
});
