/**
 * Climber pseudonym tests — the public skill leaderboard must never leak an
 * email, and a given user must always show the same handle.
 */

import { describe, it, expect } from "vitest";
import { climberHandle } from "../../src/lib/handle";

describe("climberHandle", () => {
  it("is deterministic for the same id", () => {
    expect(climberHandle("firebase-uid-abc")).toBe(climberHandle("firebase-uid-abc"));
  });

  it("does not contain the raw id or an email", () => {
    const h = climberHandle("alice@example.com");
    expect(h).not.toContain("alice");
    expect(h).not.toContain("@");
  });

  it("produces a readable 'Adjective Animal N' handle", () => {
    expect(climberHandle("uid-1")).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,2}$/);
  });

  it("varies across different ids (no single constant handle)", () => {
    const handles = new Set(
      Array.from({ length: 50 }, (_, i) => climberHandle(`user-${i}`))
    );
    expect(handles.size).toBeGreaterThan(10);
  });
});
