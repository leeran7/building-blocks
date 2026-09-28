/**
 * Levels need an account; guests get Endless only (Leeran, 2026-09-27).
 * The guest shell offers Endless and a sign-in prompt for Levels, and a
 * level link opened as a guest lands there instead of on a level.
 *
 * @vitest-environment happy-dom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/screens/ClimbScreen", () => ({ ClimbScreen: () => <p>practice climb</p> }));
vi.mock("../../mobile/src/components/AnimatedBackdrop", () => ({ AnimatedBackdrop: () => null }));

import { GuestShell } from "../../mobile/src/components/GuestShell";

let container: HTMLDivElement;
let root: Root;
let pathname = "";

function Where() {
  const loc = useLocation();
  useEffect(() => {
    pathname = loc.pathname;
  }, [loc]);
  return null;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderGuest(path: string, onSignIn = vi.fn()) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <GuestShell onSignIn={onSignIn} />
      </MemoryRouter>,
    );
  });
  return onSignIn;
}

const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe("guest shell", () => {
  it("offers Endless and sends Levels to sign in", async () => {
    const onSignIn = await renderGuest("/");
    expect(button("Endless, climb as high as you can")).toBeTruthy();

    await act(async () => button("Sign in to play Levels")?.click());
    expect(onSignIn).toHaveBeenCalledTimes(1);

    await act(async () => button("Endless, climb as high as you can")?.click());
    expect(pathname).toBe("/climb");
    expect(container.textContent).toContain("practice climb");
  });

  it("shows the guest home, not a level, for a level link", async () => {
    await renderGuest("/levels/3/play");
    expect(button("Sign in to play Levels")).toBeTruthy();
    expect(container.textContent).not.toContain("Level 3");
  });
});
