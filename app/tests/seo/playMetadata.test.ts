/**
 * AC-10 — /play metadata is generic and does not decode replay tokens.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/Game/ClimbPlayClient", () => ({
  ClimbPlayClient: () => null,
}));
vi.mock("../../src/components/FreeStackShell", () => ({
  FreeStackShell: ({ children }: { children: unknown }) => children,
}));

import { getPlayPageMetadata } from "../../src/seo/playMetadata";
import { generateMetadata as playGenerateMetadata } from "../../app/play/page";
import * as runReplay from "../../src/game/runReplay";

describe("getPlayPageMetadata (AC-10)", () => {
  it("returns generic play copy and does not call decodeRunReplay", () => {
    const spy = vi.spyOn(runReplay, "decodeRunReplay");
    const meta = getPlayPageMetadata();
    expect(spy).not.toHaveBeenCalled();
    expect(meta.title).toBe("Play the Free Climb — Stack");
    expect(typeof meta.description).toBe("string");
    expect(String(meta.description)).toContain("Endless climb");
    expect(String(meta.title)).not.toMatch(/Climbed \d+m/);
    expect(String(meta.description)).not.toMatch(/Watch this \d+m climb/);
  });

  it("is constant — calling it twice yields the same generic copy (no token arg)", () => {
    const a = getPlayPageMetadata();
    const b = getPlayPageMetadata();
    expect(a).toEqual(b);
    expect(getPlayPageMetadata.length).toBe(0);
  });

  it("is what /play generateMetadata returns (non-test caller)", () => {
    expect(playGenerateMetadata()).toEqual(getPlayPageMetadata());
  });
});
