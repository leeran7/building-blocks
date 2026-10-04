/**
 * The Sign In screen's guest option (Leeran, 2026-10-04): under "Continue as
 * Guest" a short line says what a guest gets and what signing in adds, and the
 * button is described by it for screen readers.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({
    signInApple: vi.fn(async () => {}),
    signInGoogle: vi.fn(async () => {}),
    signInEmail: vi.fn(async () => {}),
    createAccount: vi.fn(async () => {}),
  }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapMedium: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

import { SignInScreen } from "../../mobile/src/screens/SignInScreen";
import { GUEST_LEVEL_CAP } from "../../mobile/src/lib/levels/guestClient";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(onGuestContinue?: () => void) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SignInScreen onGuestContinue={onGuestContinue} />
      </MemoryRouter>,
    );
  });
}

const guestButton = () =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Continue as Guest");

describe("Sign In: Continue as Guest", () => {
  it("explains the guest taster under the button and describes the button with it", async () => {
    const onGuest = vi.fn();
    await render(onGuest);
    const button = guestButton();
    expect(button).toBeTruthy();

    const noteId = button?.getAttribute("aria-describedby");
    expect(noteId).toBeTruthy();
    const note = noteId ? document.getElementById(noteId) : null;
    expect(note).not.toBeNull();
    const text = note?.textContent ?? "";
    expect(text).toContain(`Guests play Endless and the first ${GUEST_LEVEL_CAP} levels.`);
    for (const perk of ["keep stars", "play every level", "add friends", "save scores"]) expect(text).toContain(perk);
    // Short: one line of help, not a paragraph.
    expect(text.length).toBeLessThanOrEqual(140);

    await act(async () => button?.click());
    expect(onGuest).toHaveBeenCalledTimes(1);
  });

  it("(control) shows no guest option or line when guests are not offered", async () => {
    await render();
    expect(guestButton()).toBeUndefined();
    expect(container.textContent).not.toContain("Guests play Endless");
  });
});
