import { describe, it, expect } from "vitest";
import {
  normalizeUsername,
  suggestUsername,
  USERNAME_MIN,
  USERNAME_MAX,
} from "../../src/lib/username";

describe("username — normalizeUsername", () => {
  it("lowercases, strips a leading @, and accepts a valid dashed handle", () => {
    const r = normalizeUsername("@Creator-1");
    expect(r.valid).toBe(true);
    expect(r.username).toBe("creator-1");
  });

  it("enforces length bounds", () => {
    expect(normalizeUsername("a".repeat(USERNAME_MIN - 1)).valid).toBe(false);
    expect(normalizeUsername("a".repeat(USERNAME_MAX + 1)).valid).toBe(false);
    expect(normalizeUsername("a".repeat(USERNAME_MIN)).valid).toBe(true);
  });

  it("accepts dashes but rejects underscores, spaces, dots", () => {
    expect(normalizeUsername("has-dash").valid).toBe(true);
    expect(normalizeUsername("under_score").valid).toBe(false);
    expect(normalizeUsername("has space").valid).toBe(false);
    expect(normalizeUsername("dots.dots").valid).toBe(false);
  });

  it("rejects leading/trailing dashes", () => {
    expect(normalizeUsername("-lead").valid).toBe(false);
    expect(normalizeUsername("trail-").valid).toBe(false);
  });

  it("rejects reserved and hateful names", () => {
    expect(normalizeUsername("admin").valid).toBe(false);
    expect(normalizeUsername("official").valid).toBe(false);
  });

  it("rejects empty input", () => {
    expect(normalizeUsername("").valid).toBe(false);
    expect(normalizeUsername("   ").valid).toBe(false);
  });
});

describe("username — suggestUsername", () => {
  it("derives a valid dashed handle from a display name", () => {
    expect(suggestUsername("Acme Labs")).toBe("acme-labs");
    expect(suggestUsername("  Elena  Voss!! ")).toBe("elena-voss");
  });

  it("returns empty when nothing valid can be derived", () => {
    expect(suggestUsername("!!!")).toBe("");
    expect(suggestUsername("")).toBe("");
  });
});
