/**
 * AC-17, AC-19 — platform limits. Over-limit ⇒ invalid, never a sliced string.
 */

import { describe, expect, it } from "vitest";
import {
  SHARE_FIELD_LIMITS,
  validateShareFieldLength,
} from "../../src/share/limits";

function assertNoSlicedString(
  result: ReturnType<typeof validateShareFieldLength>,
  slicedLen: number
): void {
  expect(Object.keys(result).sort()).toEqual(["length", "limit", "valid"]);
  expect(result).not.toHaveProperty("sliced");
  expect(result).not.toHaveProperty("text");
  expect(result).not.toHaveProperty("value");
  expect(result).not.toHaveProperty("caption");
  const stringValues = Object.values(result).filter(
    (v): v is string => typeof v === "string"
  );
  expect(stringValues.some((v) => v.length === slicedLen)).toBe(false);
}

describe("SHARE_FIELD_LIMITS (AC-19)", () => {
  it("matches X 280 / TikTok 2200 / YouTube title 100 / description 5000", () => {
    expect(SHARE_FIELD_LIMITS.X_CAPTION).toBe(280);
    expect(SHARE_FIELD_LIMITS.TIKTOK_CAPTION).toBe(2200);
    expect(SHARE_FIELD_LIMITS.YOUTUBE_TITLE).toBe(100);
    expect(SHARE_FIELD_LIMITS.YOUTUBE_DESCRIPTION).toBe(5000);
  });
});

describe("validateShareFieldLength (AC-17)", () => {
  it("accepts empty, exact limit, and just-under", () => {
    expect(validateShareFieldLength("", 280)).toEqual({
      valid: true,
      length: 0,
      limit: 280,
    });
    const exact = "x".repeat(280);
    expect(validateShareFieldLength(exact, SHARE_FIELD_LIMITS.X_CAPTION)).toEqual(
      {
        valid: true,
        length: 280,
        limit: 280,
      }
    );
    expect(
      validateShareFieldLength("x".repeat(279), SHARE_FIELD_LIMITS.X_CAPTION)
        .valid
    ).toBe(true);
  });

  it("rejects a 281-char X caption without returning a 280-char slice", () => {
    const caption = "x".repeat(281);
    expect(caption.length).toBe(281);
    const result = validateShareFieldLength(
      caption,
      SHARE_FIELD_LIMITS.X_CAPTION
    );
    expect(result.valid).toBe(false);
    expect(result.length).toBe(281);
    expect(result.limit).toBe(280);
    assertNoSlicedString(result, 280);
  });

  it("rejects a 2201-char TikTok caption without a 2200-char slice", () => {
    const caption = "t".repeat(2201);
    expect(caption.length).toBe(2201);
    const result = validateShareFieldLength(
      caption,
      SHARE_FIELD_LIMITS.TIKTOK_CAPTION
    );
    expect(result.valid).toBe(false);
    expect(result.length).toBe(2201);
    expect(result.limit).toBe(2200);
    assertNoSlicedString(result, 2200);
  });

  it("rejects a 101-char YouTube title without a 100-char slice", () => {
    const title = "y".repeat(101);
    expect(title.length).toBe(101);
    const result = validateShareFieldLength(
      title,
      SHARE_FIELD_LIMITS.YOUTUBE_TITLE
    );
    expect(result.valid).toBe(false);
    expect(result.length).toBe(101);
    expect(result.limit).toBe(100);
    assertNoSlicedString(result, 100);
  });
});
