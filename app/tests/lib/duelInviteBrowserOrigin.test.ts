/**
 * parseDuelInvite — the DEFAULT-origin path (AC-10).
 *
 * The single production caller (DuelHome.tsx:292) passes ONE argument, so the
 * expectedOrigin defaults to appOrigin(). In the browser that resolves to
 * window.location.origin — the exact code path that ships and that the
 * node-environment suite never exercises (no `window` there). These tests stub
 * window.location.origin and drive the default path, so the accept/reject
 * decision the real caller relies on is proven, not assumed.
 *
 * appOrigin is intentionally private; it is asserted through parseDuelInvite's
 * default parameter (its only consumer), never re-implemented here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDuelInvite } from "../../src/lib/duelInvite";

const ID = "abcdef123456";
const APP_ORIGIN = "https://doomstack.example";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDuelInvite — browser default origin (window.location.origin)", () => {
  it("accepts a same-origin /duel/<id> URL using the live browser origin", () => {
    vi.stubGlobal("window", { location: { origin: APP_ORIGIN } });
    expect(parseDuelInvite(`${APP_ORIGIN}/duel/${ID}`)).toBe(ID);
  });

  it("rejects a cross-origin URL against the live browser origin", () => {
    vi.stubGlobal("window", { location: { origin: APP_ORIGIN } });
    expect(parseDuelInvite(`https://evil.dev/duel/${ID}`)).toBeNull();
  });

  it("fails closed when the browser origin is opaque (\"null\")", () => {
    vi.stubGlobal("window", { location: { origin: "null" } });
    expect(parseDuelInvite(`${APP_ORIGIN}/duel/${ID}`)).toBeNull();
  });

  it("fails closed when the browser origin is empty", () => {
    vi.stubGlobal("window", { location: { origin: "" } });
    expect(parseDuelInvite(`${APP_ORIGIN}/duel/${ID}`)).toBeNull();
  });

  it("still accepts a root-relative /duel/<id> regardless of origin", () => {
    vi.stubGlobal("window", { location: { origin: "null" } });
    expect(parseDuelInvite(`/duel/${ID}`)).toBe(ID);
  });
});
