/**
 * In the website build, the app reports no auth state until Firebase has
 * restored the saved session, so a signed-in visitor never flashes the guest
 * map or Sign In first.
 */

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  let release = () => {};
  return {
    ready: new Promise<void>((r) => (release = r)),
    release: () => release(),
    getCurrentUser: vi.fn(async () => ({ user: { uid: "u1" } })),
  };
});

vi.mock("@app/lib/firebase", () => ({ auth: { authStateReady: () => h.ready } }));
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    getCurrentUser: h.getCurrentUser,
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
  },
}));

import { onAuthChange } from "../../mobile/src/lib/firebaseAuth";

describe("onAuthChange in the website build", () => {
  it("waits for Firebase to restore the session before the first report", async () => {
    const cb = vi.fn();
    const done = onAuthChange(cb, true);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.getCurrentUser).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    h.release();
    await done;
    expect(cb).toHaveBeenCalledWith({ uid: "u1" });
  });
});
