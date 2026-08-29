import { describe, it, expect } from "vitest";
import { checkAvoidTerms, validateCaptionLength, sanitizeForStorage } from "../../src/social/services/safety";

describe("safety", () => {
  it("blocks drafts containing avoid-listed terms (AC-13)", () => {
    const result = checkAvoidTerms("We love gambling tips!", ["gambling"]);
    expect(result.blocked).toBe(true);
    expect(result.matchedTerms).toContain("gambling");
  });

  it("is case-insensitive for avoid terms", () => {
    const result = checkAvoidTerms("GAMBLING content", ["gambling"]);
    expect(result.blocked).toBe(true);
  });

  it("flags over-limit captions without truncating (AC-17)", () => {
    const long = "x".repeat(300);
    const result = validateCaptionLength("X", long);
    expect(result.valid).toBe(false);
    expect(result.limit).toBe(280);
    expect(result.length).toBe(300);
  });

  it("redacts credential-shaped keys in stored JSON (AC-55)", () => {
    const sanitized = sanitizeForStorage({ accessToken: "secret", title: "hello" });
    expect(sanitized).toEqual({ accessToken: "[redacted]", title: "hello" });
  });
});
