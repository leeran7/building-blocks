/**
 * AC-40 — recording page is public; middleware matcher does not include /r/.
 * Importing `config` from middleware.ts is a production export, not a source grep.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("../../src/db/climb", () => ({
  getShareableClimbRun: vi.fn(),
  getClimbRunReplayToken: vi.fn(),
}));

vi.mock("../../src/components/Game/ClimbPlayClient", () => ({
  ClimbPlayClient: () => null,
}));
vi.mock("../../src/components/FreeStackShell", () => ({
  FreeStackShell: ({ children }: { children: unknown }) => children,
}));

import { config } from "../../middleware";
import { generateMetadata } from "../../app/r/[id]/page";
import { getShareableClimbRun } from "../../src/db/climb";
import { PROD_ORIGIN } from "../share/fixtures";

describe("middleware matcher (AC-40)", () => {
  it("does not include a /r/ entry, so bots are not 401'd by the matcher", () => {
    const matcher = config.matcher;
    expect(Array.isArray(matcher)).toBe(true);
    expect(
      matcher.some(
        (entry) =>
          entry === "/r" ||
          entry === "/r/:path*" ||
          entry.includes("/r/") ||
          entry.startsWith("/r")
      )
    ).toBe(false);
  });
});

describe("recording page generateMetadata is unauthenticated (AC-40)", () => {
  beforeEach(() => {
    vi.mocked(getShareableClimbRun).mockReset();
  });

  it("returns unique metadata without an Authorization header", async () => {
    vi.stubEnv("BASE_URL", PROD_ORIGIN);
    vi.mocked(getShareableClimbRun).mockResolvedValue({
      id: "rec_test_1",
      peakY: 100,
      handle: "Maya",
    });
    const meta = await generateMetadata({
      params: Promise.resolve({ id: "rec_test_1" }),
    });
    expect(meta.twitter?.card).toBe("summary_large_image");
    expect(String(meta.openGraph?.url)).toContain("/r/rec_test_1");
    vi.unstubAllEnvs();
  });

  it("does not throw an auth error for a missing recording (404, not 401)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    await expect(
      generateMetadata({ params: Promise.resolve({ id: "rec_missing" }) })
    ).rejects.toThrow(/NOT_FOUND|NEXT_NOT_FOUND/);
  });
});
