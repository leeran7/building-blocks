/**
 * GameSettings is bundled into the Vite app (ExpeditionHud) and the portal
 * builds as well as the Next website. Nothing from `next/*` may load there:
 * next/link reads `process`, the app then throws "process is not defined" and
 * no screen renders (every "app ... did not render" UX failure on PR #292's
 * dropdown commit).
 *
 * Each `next/*` entry is mocked to throw on load, then the real module and its
 * ⚙ panel are loaded and driven on a touch screen with a stack band on the page.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => true }));
for (const id of ["next/link", "next/navigation", "next/image", "next/script", "next/dynamic"]) {
  vi.doMock(id, () => {
    throw new Error(`${id} must not load in a module the Vite app bundles`);
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GameSettings in the Vite app", () => {
  it("loads and lists the band's Leaderboard tab without any next/* module", async () => {
    const { GameSettingsButton } = await import("../../src/components/Game/GameSettings");
    document.body.innerHTML =
      '<div role="tablist"><a role="tab" aria-selected="true" href="/play">Play</a><a role="tab" aria-selected="false" href="/climb">Leaderboard</a></div><div id="host"></div>';
    const host = document.getElementById("host")!;
    const root = createRoot(host);
    act(() => root.render(createElement(GameSettingsButton, { muted: false, onToggleMute: () => {} })));
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());

    const row = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Leaderboard"));
    expect(row?.getAttribute("href")).toBe("/climb");
    act(() => root.unmount());
  });
});
