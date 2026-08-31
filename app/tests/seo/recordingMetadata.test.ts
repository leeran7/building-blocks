/**
 * AC-5–9, AC-11 — recording page metadata helper.
 * getShareableClimbRun is mocked (Prisma); helper + URL builders are real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/climb", () => ({
  getShareableClimbRun: vi.fn(),
}));

import type { Metadata } from "next";
import { getRecordingPageMetadata } from "../../src/seo/recordingMetadata";
import { getShareableClimbRun } from "../../src/db/climb";
import { parseRecordingId } from "../../src/share/parseRecordingId";
import { buildRecordingCanonicalUrl, buildRecordingOgImageUrl } from "../../src/share/urls";
import { HOMEPAGE_OG_TITLE, PROD_ORIGIN } from "../share/fixtures";

function ogUrl(meta: Metadata): string {
  return String(meta.openGraph?.url ?? "");
}

function ogImageUrl(meta: Metadata): string {
  const images = meta.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "url" in first) {
    return String(first.url);
  }
  return "";
}

describe("getRecordingPageMetadata (AC-5, AC-8, AC-9, AC-11)", () => {
  beforeEach(() => {
    vi.mocked(getShareableClimbRun).mockReset();
  });

  it("emits unique og:url / og:image and peak metres per recording (AC-8, AC-9)", async () => {
    vi.mocked(getShareableClimbRun).mockImplementation(async (id: string) => {
      if (id === "rec_peak_100") {
        return { id: "rec_peak_100", peakY: 100, handle: "Maya" };
      }
      if (id === "rec_peak_250") {
        return { id: "rec_peak_250", peakY: 250, handle: "Maya" };
      }
      return null;
    });

    const a = await getRecordingPageMetadata("rec_peak_100", PROD_ORIGIN);
    const b = await getRecordingPageMetadata("rec_peak_250", PROD_ORIGIN);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("expected metadata");

    expect(ogUrl(a.metadata)).toBe(
      buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_peak_100")
    );
    expect(ogUrl(b.metadata)).toBe(
      buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_peak_250")
    );
    expect(ogUrl(a.metadata)).not.toBe(ogUrl(b.metadata));
    expect(ogImageUrl(a.metadata)).toBe(
      buildRecordingOgImageUrl(PROD_ORIGIN, "rec_peak_100", "landscape")
    );
    expect(ogImageUrl(b.metadata)).toBe(
      buildRecordingOgImageUrl(PROD_ORIGIN, "rec_peak_250", "landscape")
    );
    expect(ogImageUrl(a.metadata)).not.toBe(ogImageUrl(b.metadata));

    expect(String(a.metadata.title)).toContain("100");
    expect(String(a.metadata.description)).toContain("100");
    expect(String(b.metadata.title)).toContain("250");
    expect(String(b.metadata.description)).toContain("250");
    expect(String(a.metadata.title)).not.toContain("250");
    expect(String(b.metadata.title)).not.toContain("100");

    expect(a.metadata.twitter?.card).toBe("summary_large_image");
    expect(String(a.metadata.openGraph?.title)).not.toBe(HOMEPAGE_OG_TITLE);
    expect(ogUrl(a.metadata)).toBe(
      buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_peak_100")
    );
  });

  it("returns NOT_FOUND for unknown id — not homepage title or listing OG (AC-5, AC-11)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    const result = await getRecordingPageMetadata("rec_missing", PROD_ORIGIN);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected NOT_FOUND");
    expect(result.reason).toBe("NOT_FOUND");
    expect(JSON.stringify(result)).not.toContain(HOMEPAGE_OG_TITLE);
    expect(JSON.stringify(result)).not.toContain("/api/og?");
  });

  it("returns NOT_FOUND for an unreplayable id (AC-6 via null DTO)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    const result = await getRecordingPageMetadata("rec_notoken", PROD_ORIGIN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for parser-rejected ids (AC-7)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    for (const id of ["", " ", "ab/cd", "..", "foo.bar"]) {
      expect(parseRecordingId(id)).toBeNull();
      const result = await getRecordingPageMetadata(id, PROD_ORIGIN);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NOT_FOUND");
    }
  });
});
