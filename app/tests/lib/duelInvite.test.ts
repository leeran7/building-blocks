/**
 * parseDuelInvite — allow-list parser for a pasted 1v1 challenge link.
 * This is the only new untrusted-input surface in the Doomstack layout pass
 * (AC-10). It must return null (never a default/fallback) for anything that
 * is not provably a duel id or a /duel/<id> path, and the caller navigates
 * from the RETURNED id, never the raw string.
 */

import { describe, it, expect } from "vitest";
import { parseDuelInvite } from "../../src/lib/duelInvite";

const ID = "abcdef123456"; // 12 chars, within [A-Za-z0-9_-]{6,64}

describe("parseDuelInvite — rejects (returns null, not a default)", () => {
  it("javascript: URL", () => {
    expect(parseDuelInvite("javascript:alert(1)")).toBeNull();
  });

  it("protocol-relative URL (host smuggling)", () => {
    expect(parseDuelInvite(`//evil.dev/duel/${ID}`)).toBeNull();
  });

  it("valid http(s) URL whose path is not /duel/<id>", () => {
    expect(parseDuelInvite("https://x.dev/play")).toBeNull();
  });

  it("cross-origin URL with an otherwise-valid /duel/<id> path", () => {
    expect(parseDuelInvite(`https://evil.dev/duel/${ID}`)).toBeNull();
  });

  it("id segment too short (below the 6-char floor)", () => {
    expect(parseDuelInvite("/duel/abc")).toBeNull();
  });

  it("path with an extra segment after the id", () => {
    expect(parseDuelInvite("/duel/a/b")).toBeNull();
  });

  it("empty string", () => {
    expect(parseDuelInvite("")).toBeNull();
  });

  it("whitespace-only string", () => {
    expect(parseDuelInvite("   ")).toBeNull();
  });

  it("bare id containing disallowed characters (dot)", () => {
    expect(parseDuelInvite("abc.def123")).toBeNull();
  });

  it("bare id containing disallowed characters (slash)", () => {
    expect(parseDuelInvite("abc/def123")).toBeNull();
  });

  it("id too long (above the 64-char ceiling)", () => {
    expect(parseDuelInvite("a".repeat(65))).toBeNull();
  });

  it("data: URL", () => {
    expect(parseDuelInvite("data:text/html,<script>alert(1)</script>")).toBeNull();
  });
});

describe("parseDuelInvite — accepts (returns the parsed id)", () => {
  it("absolute origin + /duel/<id>", () => {
    expect(parseDuelInvite(`https://doomstack.example/duel/${ID}`)).toBe(ID);
  });

  it("root-relative /duel/<id> with a query string", () => {
    expect(parseDuelInvite(`/duel/${ID}?x=1`)).toBe(ID);
  });

  it("root-relative /duel/<id> with a trailing slash", () => {
    expect(parseDuelInvite(`/duel/${ID}/`)).toBe(ID);
  });

  it("a bare id", () => {
    expect(parseDuelInvite(ID)).toBe(ID);
  });

  it("a bare id with surrounding whitespace (paste artifact)", () => {
    expect(parseDuelInvite(`  ${ID}  `)).toBe(ID);
  });

  it("shortest valid id (6 chars)", () => {
    expect(parseDuelInvite("abcdef")).toBe("abcdef");
  });
});
