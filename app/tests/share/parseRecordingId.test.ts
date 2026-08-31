/**
 * AC-7 — allow-list recording id parser. Reject never default.
 */

import { describe, expect, it } from "vitest";
import { parseRecordingId } from "../../src/share/parseRecordingId";

describe("parseRecordingId (AC-7)", () => {
  it("accepts a valid id and lowercases it", () => {
    expect(parseRecordingId("rec_test_1")).toBe("rec_test_1");
    expect(parseRecordingId("REC_TEST_1")).toBe("rec_test_1");
  });

  it("accepts min length (one alphanumeric) and max length 32", () => {
    expect(parseRecordingId("a")).toBe("a");
    const max = "a".repeat(32);
    expect(max.length).toBe(32);
    expect(parseRecordingId(max)).toBe(max);
  });

  it("rejects empty, whitespace, slash, .., percent, over-max, and proto keys", () => {
    expect(parseRecordingId("")).toBeNull();
    expect(parseRecordingId("   ")).toBeNull();
    expect(parseRecordingId(" rec_test_1")).toBeNull();
    expect(parseRecordingId("rec_test_1 ")).toBeNull();
    expect(parseRecordingId("ab/cd")).toBeNull();
    expect(parseRecordingId("..")).toBeNull();
    expect(parseRecordingId("foo.bar")).toBeNull();
    expect(parseRecordingId("%00")).toBeNull();
    expect(parseRecordingId("a".repeat(33))).toBeNull();
    expect(parseRecordingId("constructor")).toBeNull();
    expect(parseRecordingId("__proto__")).toBeNull();
  });

  it("rejects null, undefined, and non-strings (wrong type)", () => {
    expect(parseRecordingId(null)).toBeNull();
    expect(parseRecordingId(undefined)).toBeNull();
    expect(parseRecordingId(123 as unknown as string)).toBeNull();
  });

  it("does not substitute a demo id", () => {
    expect(parseRecordingId("")).toBeNull();
    expect(parseRecordingId("..")).not.toBe("demo");
    expect(parseRecordingId("..")).not.toBe("rec_test_1");
  });
});
