/**
 * Challenger identity on the WEB Challenge/duel screen —
 * src/components/Challenge/PendingChallenges.
 *
 * Mirrors tests/components/mobilePendingChallengesIdentity.test.tsx (mobile
 * tree). The reviewer's original critical finding
 * (loop/handoffs/reviewer-2026-09-20T015000Z.json) was that BOTH trees had no
 * `@username` sub-line on this component's rows; the fix landed in both files
 * in the same commit (see software-engineer-2026-09-20T020500Z.json), but only
 * the mobile tree got an automated regression test. This file closes that gap
 * for the web tree so the critical finding is verified fixed on both surfaces,
 * not reasoned about on one of them.
 *
 * Same two facts make this reachable and unrecoverable if the sub-line is ever
 * dropped again: `ensureUser` never writes `display_name` (null is the default
 * for every account), and `createChallenge` has no friendship requirement (a
 * stranger's Add-a-friend row can't be used to cross-reference the handle).
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { climberHandle } from "../../src/lib/handle";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { uid: "me" }, loading: false, isAnonymous: false, signOut: async () => {} }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { PendingChallenges } from "../../src/components/Challenge/PendingChallenges";

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
    root.render(el);
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

describe("PendingChallenges (web) — challenger identity", () => {
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

    const { container, unmount } = mount(createElement(PendingChallenges));
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

    const { container, unmount } = mount(createElement(PendingChallenges));
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

    const { container, unmount } = mount(createElement(PendingChallenges));
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

    const { container, unmount } = mount(createElement(PendingChallenges));
    await flush();

    const rendered = lines(container);
    expect(rendered).toContain("Bob Smith challenged you");
    expect(rendered).toContain("@bobsmith");
    expect(rendered).not.toContain(`${climberHandle("stranger-3")} challenged you`);

    unmount();
  });
});
