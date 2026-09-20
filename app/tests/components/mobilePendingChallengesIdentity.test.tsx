/**
 * Challenge identity on the native (Capacitor) Challenge screen —
 * mobile/src/components/challenge/PendingChallengesSection.
 *
 * Why this file exists: `createChallenge` has no friendship requirement, so the
 * challenger may be a complete stranger, and `display_name` is null for every
 * account until the player sets one (`ensureUser` never writes it). If the
 * pending-challenge row shows only `climberDisplay(...)`, the recipient sees an
 * unidentifiable pseudonym ("Swift Ibex 42 challenged you") with no handle to
 * look up anywhere on the screen. Both rows must therefore render the primary
 * pseudonym line AND the `@username` sub-line.
 *
 * It also exercises the `@app/*` alias (vitest + app/tsconfig.json) against a
 * real mobile component: the component reaches shared Next code through
 * `@app/lib/handle`, and this test compares against that module's real output
 * rather than a hardcoded pseudonym.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { climberHandle } from "@app/lib/handle";
import { PendingChallengesSection } from "../../mobile/src/components/challenge/PendingChallengesSection";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const HOUR_MS = 3_600_000;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function challenge(overrides: {
  id: string;
  direction: "sent" | "received";
  sender: { id: string; displayName: string | null; username: string | null };
  recipient: { id: string; displayName: string | null; username: string | null };
}) {
  return {
    id: overrides.id,
    senderId: overrides.sender.id,
    recipientId: overrides.recipient.id,
    categorySlug: "classic",
    status: "pending",
    expiresAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
    createdAt: new Date().toISOString(),
    sender: overrides.sender,
    recipient: overrides.recipient,
    direction: overrides.direction,
  };
}

function mount(el: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(MemoryRouter, null, el));
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

/** Every rendered text line, trimmed — the row's identity lines live in <p>s. */
function lines(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("p")).map((p) => p.textContent?.trim() ?? "");
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PendingChallengesSection (mobile) — challenger identity", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the pseudonym primary line AND the @username sub-line for an incoming challenge from a username-only stranger", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        challenge({
          id: "ch-1",
          direction: "received",
          sender: { id: "stranger-1", displayName: null, username: "bobsmith" },
          recipient: { id: "me", displayName: null, username: "mine" },
        }),
      ])
    );

    const { container, unmount } = mount(createElement(PendingChallengesSection));
    await flush();

    const rendered = lines(container);
    // Compared against the real climberHandle, never a hardcoded pseudonym.
    const pseudonym = climberHandle("stranger-1");
    expect(rendered).toContain(`${pseudonym} challenged you`);
    expect(rendered).toContain("@bobsmith");
    // The countdown still renders alongside the handle, not instead of it.
    expect(rendered.some((line) => line.endsWith("left"))).toBe(true);

    unmount();
  });

  it("shows the pseudonym AND the @username sub-line for the recipient of a sent challenge", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        challenge({
          id: "ch-2",
          direction: "sent",
          sender: { id: "me", displayName: null, username: "mine" },
          recipient: { id: "target-1", displayName: null, username: "alicejones" },
        }),
      ])
    );

    const { container, unmount } = mount(createElement(PendingChallengesSection));
    await flush();

    const rendered = lines(container);
    expect(rendered).toContain(`Waiting for ${climberHandle("target-1")}`);
    expect(rendered).toContain("@alicejones");

    unmount();
  });

  it("omits the sub-line when the challenger has no username at all", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        challenge({
          id: "ch-3",
          direction: "received",
          sender: { id: "stranger-2", displayName: null, username: null },
          recipient: { id: "me", displayName: null, username: null },
        }),
      ])
    );

    const { container, unmount } = mount(createElement(PendingChallengesSection));
    await flush();

    const rendered = lines(container);
    expect(rendered).toContain(`${climberHandle("stranger-2")} challenged you`);
    expect(rendered.filter((line) => line.startsWith("@"))).toEqual([]);

    unmount();
  });

  it("prefers a set display name over the pseudonym while still showing the handle", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        challenge({
          id: "ch-4",
          direction: "received",
          sender: { id: "stranger-3", displayName: "Bob Smith", username: "bobsmith" },
          recipient: { id: "me", displayName: null, username: null },
        }),
      ])
    );

    const { container, unmount } = mount(createElement(PendingChallengesSection));
    await flush();

    const rendered = lines(container);
    expect(rendered).toContain("Bob Smith challenged you");
    expect(rendered).toContain("@bobsmith");
    expect(rendered).not.toContain(`${climberHandle("stranger-3")} challenged you`);

    unmount();
  });
});
