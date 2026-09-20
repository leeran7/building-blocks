/**
 * ClimbBoard smoke render (server-rendered shell, before the viewer effect
 * fires). No prior test rendered ClimbBoard at all (see software-engineer
 * handoff 2026-09-20T14:52:00Z). This catches a future change that breaks
 * the server-rendered markup /climb ships before hydration — the initial
 * "loading" / "anonymous" viewer state, the board scope nav, and the
 * standings table composed from server-provided climbers[].
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, token: null, loading: false }),
}));

import { ClimbBoard } from "../../src/components/Climb/ClimbBoard";

const CLIMBERS: ClimberRank[] = [
  { rank: 1, userId: "u1", handle: "apex", username: "apex", peakY: 900, wins: 2 },
  { rank: 2, userId: "u2", handle: "rival", username: null, peakY: 700, wins: 0 },
];

describe("ClimbBoard smoke render", () => {
  it("renders the board scope nav, standings, and CTA panel for a signed-out viewer", () => {
    const html = renderToStaticMarkup(createElement(ClimbBoard, { climbers: CLIMBERS }));
    expect(html).toContain("Solo");
    expect(html).toContain("1v1");
    expect(html).toContain("apex");
    expect(html).toContain("rival");
    // Before the viewer effect settles (no effects run in a static server
    // render), the panel shows its initial loading copy — never the CTA-only
    // fallback text, and the standings render regardless.
    expect(html).toContain("Checking your standing");
    expect(html).toContain("Play the climb");
  });

  it("renders the unavailable state without throwing when the board read failed", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbBoard, { climbers: [], unavailable: true })
    );
    expect(html).toContain("standings unavailable");
    expect(html).not.toContain("no climbers yet");
  });

  it("renders the empty state without throwing when there are no climbers yet", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbBoard, { climbers: [], unavailable: false })
    );
    expect(html).toContain("no climbers yet");
  });
});
