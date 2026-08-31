/**
 * AC-12–16, AC-18, AC-15 — pure share-payload builder.
 * Invoke production; do not re-implement templates.
 */

import { describe, expect, it } from "vitest";
import { buildRecordingSharePayload } from "../../src/share/payload";
import { SHARE_FIELD_LIMITS } from "../../src/share/limits";
import { buildRecordingCanonicalUrl, buildRecordingOgImageUrl } from "../../src/share/urls";
import { HOMEPAGE_OG_TITLE, PROD_ORIGIN, sampleRecording } from "./fixtures";

function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      acc.push(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

describe("buildRecordingSharePayload (AC-12, AC-13, AC-14, AC-16, AC-18)", () => {
  it("returns ok:true with the AC-12 field shape", () => {
    const recording = sampleRecording({ peakY: 100, handle: "Maya" });
    const result = buildRecordingSharePayload(recording, PROD_ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok payload");
    const { data } = result;
    const canonical = buildRecordingCanonicalUrl(PROD_ORIGIN, recording.id);
    expect(data.recordingId).toBe("rec_test_1");
    expect(data.canonicalUrl).toBe(canonical);
    expect(data.imageUrl).toBe(
      buildRecordingOgImageUrl(PROD_ORIGIN, recording.id, "landscape")
    );
    expect(data.imageUrlSquare).toBe(
      buildRecordingOgImageUrl(PROD_ORIGIN, recording.id, "square")
    );
    expect(Number.isFinite(data.peakY)).toBe(true);
    expect(data.peakY).toBe(100);
    expect(data.handle).toBe("Maya");
    expect(data.handle === null || !/@/.test(data.handle)).toBe(true);

    const { X, TIKTOK, YOUTUBE } = data.platforms;
    expect(X.platform).toBe("X");
    expect(X.contentType).toBe("X_POST");
    expect(TIKTOK.platform).toBe("TIKTOK");
    expect(TIKTOK.contentType).toBe("TIKTOK_VIDEO");
    expect(YOUTUBE.platform).toBe("YOUTUBE");
    expect(YOUTUBE.contentType).toBe("YOUTUBE_SHORT");

    for (const p of [X, TIKTOK, YOUTUBE]) {
      expect(typeof p.title).toBe("string");
      expect(typeof p.caption).toBe("string");
      expect(typeof p.description).toBe("string");
      expect(Array.isArray(p.hashtags)).toBe(true);
      expect(p.hashtags.every((h) => !h.startsWith("#"))).toBe(true);
      expect(p.cta.includes(canonical)).toBe(true);
      expect(p.canonicalUrl).toBe(canonical);
    }
    expect(X.imageUrl).toBe(data.imageUrl);
    expect(YOUTUBE.imageUrl).toBe(data.imageUrl);
    expect(TIKTOK.imageUrl).toBe(data.imageUrlSquare);
  });

  it("redacts secrets from JSON.stringify(data) and handle has no @ (AC-13)", () => {
    const result = buildRecordingSharePayload(
      sampleRecording({ handle: "maya@evil.com" }),
      PROD_ORIGIN
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok payload");
    const json = JSON.stringify(result.data);
    expect(json).not.toContain("replay_token");
    expect(json).not.toContain("replayToken");
    expect(json).not.toContain("INTERNAL_TOKEN");
    expect(collectKeys(result.data).some((k) => k === "seed")).toBe(false);
    expect(json).not.toMatch(/"seed"\s*:/);
    expect(result.data.handle === null || !/@/.test(result.data.handle)).toBe(
      true
    );
    expect(result.data.handle).not.toBe("maya@evil.com");
  });

  it("sets X web_intent and TikTok/YouTube UNSUPPORTED_BY_PLATFORM (AC-14)", () => {
    const result = buildRecordingSharePayload(sampleRecording(), PROD_ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok payload");
    const { X, TIKTOK, YOUTUBE } = result.data.platforms;
    expect(X.compose.mode).toBe("web_intent");
    if (X.compose.mode !== "web_intent") throw new Error("expected web_intent");
    expect(
      X.compose.url.startsWith("https://twitter.com/intent/tweet?") ||
        X.compose.url.startsWith("https://x.com/intent/tweet?")
    ).toBe(true);
    const intent = new URL(X.compose.url);
    expect(intent.searchParams.get("text")).toBe(X.caption);

    expect(TIKTOK.compose.mode).toBe("UNSUPPORTED_BY_PLATFORM");
    if (TIKTOK.compose.mode !== "UNSUPPORTED_BY_PLATFORM") {
      throw new Error("expected unsupported");
    }
    expect(TIKTOK.compose.detail.length).toBeGreaterThan(0);
    expect(TIKTOK.compose).not.toHaveProperty("url");

    expect(YOUTUBE.compose.mode).toBe("UNSUPPORTED_BY_PLATFORM");
    if (YOUTUBE.compose.mode !== "UNSUPPORTED_BY_PLATFORM") {
      throw new Error("expected unsupported");
    }
    expect(YOUTUBE.compose.detail.length).toBeGreaterThan(0);
    expect(YOUTUBE.compose).not.toHaveProperty("url");
  });

  it("keeps X caption ≤ 280 and includes canonicalUrl (AC-16)", () => {
    const result = buildRecordingSharePayload(sampleRecording(), PROD_ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok payload");
    const { caption } = result.data.platforms.X;
    expect(caption.length).toBeLessThanOrEqual(SHARE_FIELD_LIMITS.X_CAPTION);
    expect(caption.includes(result.data.canonicalUrl)).toBe(true);
  });

  it("keeps TikTok/YouTube fields within limits and includes canonicalUrl (AC-18)", () => {
    const result = buildRecordingSharePayload(sampleRecording(), PROD_ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok payload");
    const { TIKTOK, YOUTUBE } = result.data.platforms;
    expect(TIKTOK.caption.length).toBeLessThanOrEqual(
      SHARE_FIELD_LIMITS.TIKTOK_CAPTION
    );
    expect(TIKTOK.caption.includes(result.data.canonicalUrl)).toBe(true);
    expect(YOUTUBE.title.length).toBeLessThanOrEqual(
      SHARE_FIELD_LIMITS.YOUTUBE_TITLE
    );
    expect(YOUTUBE.description.length).toBeLessThanOrEqual(
      SHARE_FIELD_LIMITS.YOUTUBE_DESCRIPTION
    );
    expect(YOUTUBE.description.includes(result.data.canonicalUrl)).toBe(true);
  });

  it("completes well under 50ms given a loaded row (NFR-1)", () => {
    const recording = sampleRecording();
    const start = performance.now();
    const result = buildRecordingSharePayload(recording, PROD_ORIGIN);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });

  it("does not emit homepage OG title in share copy", () => {
    const result = buildRecordingSharePayload(sampleRecording(), PROD_ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok payload");
    const blob = JSON.stringify(result.data);
    expect(blob).not.toContain(HOMEPAGE_OG_TITLE);
  });
});

describe("buildRecordingSharePayload negatives (AC-15)", () => {
  it("returns NOT_FOUND with no platforms data for a null recording", () => {
    const result = buildRecordingSharePayload(null, PROD_ORIGIN);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("NOT_FOUND");
    expect("data" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain("platforms");
  });

  it("returns VALIDATION_ERROR without a sliced caption when origin would overflow X", () => {
    const hugeOrigin = `https://www.doomstack.lol/${"a".repeat(400)}`;
    const result = buildRecordingSharePayload(sampleRecording(), hugeOrigin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.reason).toBe("VALIDATION_ERROR");
    expect("data" in result).toBe(false);
    const strings = Object.values(result).filter(
      (v): v is string => typeof v === "string"
    );
    expect(strings.some((v) => v.length === 280)).toBe(false);
    expect(strings.some((v) => v.length === 2200)).toBe(false);
  });
});
