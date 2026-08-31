/**
 * AC-2, AC-24 (builder half), AC-25 — canonical / OG URL builders.
 * Callers pass an explicit origin; Host is not a parameter.
 */

import { describe, expect, it, vi } from "vitest";
import { PUBLIC_CONFIG, resolveBaseUrl } from "../../src/config/public";
import {
  buildRecordCanonicalUrl,
  buildRecordingCanonicalUrl,
  buildRecordingOgImageUrl,
} from "../../src/share/urls";
import { PROD_ORIGIN } from "./fixtures";

describe("buildRecordingCanonicalUrl (AC-2, AC-24, AC-25)", () => {
  it("emits exactly {origin}/r/{id} with production origin (AC-2)", () => {
    expect(buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_test_1")).toBe(
      "https://www.doomstack.lol/r/rec_test_1"
    );
  });

  it("does not add a trailing slash or query string (AC-2)", () => {
    const url = buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_test_1");
    expect(url.endsWith("/")).toBe(false);
    expect(url).not.toContain("?");
  });

  it("strips a trailing slash on the origin argument", () => {
    expect(buildRecordingCanonicalUrl(`${PROD_ORIGIN}/`, "rec_test_1")).toBe(
      "https://www.doomstack.lol/r/rec_test_1"
    );
  });

  it("ignores a spoof Host passed as an extra argument (AC-25)", () => {
    const url = (
      buildRecordingCanonicalUrl as (
        origin: string,
        id: string,
        host?: string
      ) => string
    )(PROD_ORIGIN, "rec_test_1", "evil.example");
    expect(url).toBe("https://www.doomstack.lol/r/rec_test_1");
    expect(url.startsWith("https://evil.example")).toBe(false);
  });

  it("does not emit evil.example when origin is the production fixture (AC-25)", () => {
    const canonical = buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_test_1");
    const landscape = buildRecordingOgImageUrl(
      PROD_ORIGIN,
      "rec_test_1",
      "landscape"
    );
    const square = buildRecordingOgImageUrl(PROD_ORIGIN, "rec_test_1", "square");
    const record = buildRecordCanonicalUrl(PROD_ORIGIN, "alpha-stack");
    for (const url of [canonical, landscape, square, record]) {
      expect(url.startsWith(PROD_ORIGIN)).toBe(true);
      expect(url.startsWith("https://evil.example")).toBe(false);
    }
  });
});

describe("buildRecordingOgImageUrl", () => {
  it("points landscape and square at distinct absolute paths", () => {
    const landscape = buildRecordingOgImageUrl(
      PROD_ORIGIN,
      "rec_test_1",
      "landscape"
    );
    const square = buildRecordingOgImageUrl(PROD_ORIGIN, "rec_test_1", "square");
    expect(landscape).toBe(
      "https://www.doomstack.lol/api/og/recording/rec_test_1"
    );
    expect(square).toBe(
      "https://www.doomstack.lol/api/og/recording/rec_test_1/square"
    );
    expect(landscape).not.toBe(square);
  });
});

describe("buildRecordCanonicalUrl (AC-32 origin half)", () => {
  it("emits {origin}/b/{slug} with no trailing slash", () => {
    expect(buildRecordCanonicalUrl(PROD_ORIGIN, "alpha-stack")).toBe(
      "https://www.doomstack.lol/b/alpha-stack"
    );
  });
});

describe("PUBLIC_CONFIG.siteUrl and resolveBaseUrl (AC-24)", () => {
  it("siteUrl is the production canonical origin", () => {
    expect(PUBLIC_CONFIG.siteUrl).toBe(PROD_ORIGIN);
  });

  it("resolveBaseUrl equals production origin when NODE_ENV=production and BASE_URL is unset", () => {
    const prevBase = process.env.BASE_URL;
    delete process.env.BASE_URL;
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(resolveBaseUrl()).toBe(PROD_ORIGIN);
    } finally {
      vi.unstubAllEnvs();
      if (prevBase === undefined) delete process.env.BASE_URL;
      else process.env.BASE_URL = prevBase;
    }
  });

  it("builders given that origin emit only that origin (AC-24 builder half)", () => {
    const origin = PUBLIC_CONFIG.siteUrl;
    const urls = [
      buildRecordingCanonicalUrl(origin, "rec_test_1"),
      buildRecordingOgImageUrl(origin, "rec_test_1", "landscape"),
      buildRecordingOgImageUrl(origin, "rec_test_1", "square"),
      buildRecordCanonicalUrl(origin, "alpha-stack"),
    ];
    for (const url of urls) {
      expect(url.startsWith(`${origin}/`) || url === `${origin}/`).toBe(true);
      expect(new URL(url).origin).toBe(origin);
    }
  });
});
