/**
 * Guest mode survives a relaunch (Leeran, 2026-10-04): "Continue as Guest"
 * is kept in localStorage, so a remounted app opens on the guest shell, and
 * tapping Sign In (or signing in) clears it. The real App decides which
 * screen shows; Sign In and the guest shell are stand-ins with one button.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.uid ? { uid: auth.uid } : null, isAnonymous: false, loading: false }),
}));
vi.mock("../../mobile/src/contexts/LevelsContext", () => ({
  useLevels: () => ({ season: null, error: false }),
}));
vi.mock("../../mobile/src/lib/useNativeShell", () => ({ useNativeShell: () => {} }));
vi.mock("../../mobile/src/lib/launchSplash", () => ({ launchReady: () => true, useLaunchSplash: () => true }));
vi.mock("../../mobile/src/components/AnimatedBackdrop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mobile/src/components/AnimatedBackdrop")>()),
  AnimatedBackdrop: () => null,
}));
vi.mock("../../mobile/src/components/BottomNav", () => ({ BottomNav: () => null, BottomNavDock: () => null, isTabRoot: () => false }));
vi.mock("../../mobile/src/components/GuestShell", () => ({
  GuestShell: ({ onSignIn }: { onSignIn: () => void }) => (
    <button type="button" onClick={onSignIn}>
      guest-shell-sign-in
    </button>
  ),
}));
vi.mock("../../mobile/src/screens/SignInScreen", () => ({
  SignInScreen: ({ onGuestContinue }: { onGuestContinue: () => void }) => (
    <button type="button" onClick={onGuestContinue}>
      continue-as-guest
    </button>
  ),
}));
vi.mock("../../mobile/src/screens/LevelMapScreen", () => ({ LevelMapScreen: () => <p>account-map</p> }));

import { App } from "../../mobile/src/App";
import { GUEST_MODE_KEY } from "../../mobile/src/lib/guestMode";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  auth.uid = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function launch() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
  });
}

/** Unmount and mount the app again, as a relaunch does (storage kept). */
async function relaunch() {
  act(() => root.unmount());
  root = createRoot(container);
  await launch();
}

const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
}

describe("guest mode across launches", () => {
  it("a fresh device opens on Sign In", async () => {
    await launch();
    expect(button("continue-as-guest")).toBeTruthy();
  });

  it("Continue as Guest survives a remount, in localStorage", async () => {
    await launch();
    await click(button("continue-as-guest"));
    expect(button("guest-shell-sign-in")).toBeTruthy();
    expect(localStorage.getItem(GUEST_MODE_KEY)).toBe("1");

    await relaunch();
    expect(button("guest-shell-sign-in")).toBeTruthy();
    expect(button("continue-as-guest")).toBeUndefined();
  });

  it("tapping Sign In clears guest mode, so the next launch opens on Sign In", async () => {
    localStorage.setItem(GUEST_MODE_KEY, "1");
    await launch();
    await click(button("guest-shell-sign-in"));
    expect(button("continue-as-guest")).toBeTruthy();
    expect(localStorage.getItem(GUEST_MODE_KEY)).toBeNull();

    await relaunch();
    expect(button("continue-as-guest")).toBeTruthy();
  });

  it("signing in ends guest mode, so a later sign-out lands on Sign In", async () => {
    localStorage.setItem(GUEST_MODE_KEY, "1");
    auth.uid = "me";
    await launch();
    expect(container.textContent).toContain("account-map");
    expect(localStorage.getItem(GUEST_MODE_KEY)).toBeNull();

    auth.uid = null;
    await relaunch();
    expect(button("continue-as-guest")).toBeTruthy();
  });

  it("storage that refuses the write keeps guest mode for this launch only", async () => {
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      await launch();
      await click(button("continue-as-guest"));
      expect(button("guest-shell-sign-in")).toBeTruthy();
    } finally {
      setItem.mockRestore();
    }
    await relaunch();
    expect(button("continue-as-guest")).toBeTruthy();
  });
});
