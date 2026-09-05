import { describe, it, expect } from "vitest";
import {
  normalizeUsername,
  suggestUsername,
  USERNAME_MIN,
  USERNAME_MAX,
} from "../../src/lib/username";

describe("username — normalizeUsername", () => {
  it("lowercases, strips a leading @, and accepts a valid handle", () => {
    const r = normalizeUsername("@Creator_1");
    expect(r.valid).toBe(true);
    expect(r.username).toBe("creator_1");
  });

  it("enforces length bounds", () => {
    expect(normalizeUsername("a".repeat(USERNAME_MIN - 1)).valid).toBe(false);
    expect(normalizeUsername("a".repeat(USERNAME_MAX + 1)).valid).toBe(false);
    expect(normalizeUsername("a".repeat(USERNAME_MIN)).valid).toBe(true);
  });

  it("rejects disallowed characters", () => {
    expect(normalizeUsername("has-dash").valid).toBe(false);
    expect(normalizeUsername("has space").valid).toBe(false);
    expect(normalizeUsername("dots.dots").valid).toBe(false);
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
  it("derives a valid handle from a display name", () => {
    expect(suggestUsername("Acme Labs")).toBe("acme_labs");
  });

  it("returns empty when nothing valid can be derived", () => {
    expect(suggestUsername("!!!")).toBe("");
    expect(suggestUsername("")).toBe("");
  });
});
