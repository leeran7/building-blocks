/**
 * The website build of the app (mobile target "web"): which screen a site
 * page opens on, and guest-first start for signed-out visitors.
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it } from "vitest";
import { webStartRoute } from "../../mobile/src/lib/webEntry";
import { GUEST_MODE_KEY, readGuestMode, writeGuestMode } from "../../mobile/src/lib/guestMode";

describe("webStartRoute", () => {
  it("opens /daily on the Daily Climb", () => {
    expect(webStartRoute("/daily", "", "")).toBe("/climb?daily=1");
    expect(webStartRoute("/daily/", "", "#")).toBe("/climb?daily=1");
  });

  it("opens the Shop when Stripe Checkout sends the buyer back", () => {
    expect(webStartRoute("/play", "?gems=1", "")).toBe("/shop");
    expect(webStartRoute("/play", "?gems=0", "")).toBe("/shop");
  });

  it("leaves /play on the map, and never overrides a hash already in the URL", () => {
    expect(webStartRoute("/play", "", "")).toBeNull();
    expect(webStartRoute("/daily", "?gems=1", "#/profile")).toBeNull();
  });
});

describe("guest mode on the website", () => {
  afterEach(() => localStorage.clear());

  it("starts a signed-out visitor as a guest, until they choose Sign In", () => {
    expect(readGuestMode(true)).toBe(true);
    localStorage.setItem(GUEST_MODE_KEY, "0");
    expect(readGuestMode(true)).toBe(false);
    localStorage.setItem(GUEST_MODE_KEY, "1");
    expect(readGuestMode(true)).toBe(true);
  });

  it("keeps the native app on Sign In until Continue as Guest", () => {
    expect(readGuestMode(false)).toBe(false);
    localStorage.setItem(GUEST_MODE_KEY, "1");
    expect(readGuestMode(false)).toBe(true);
  });

  it("on the website, Sign In is remembered, and signing out of an account comes back as a guest", () => {
    writeGuestMode("sign-in", true);
    expect(readGuestMode(true)).toBe(false);
    writeGuestMode("guest", true);
    expect(readGuestMode(true)).toBe(true);
    writeGuestMode("account", true);
    expect(readGuestMode(true)).toBe(true);
  });

  it("in the native app, leaving guest mode either way goes back to Sign In", () => {
    writeGuestMode("guest", false);
    writeGuestMode("sign-in", false);
    expect(readGuestMode(false)).toBe(false);
    writeGuestMode("guest", false);
    writeGuestMode("account", false);
    expect(readGuestMode(false)).toBe(false);
  });
});
