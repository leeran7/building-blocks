/**
 * AC-37 — JSON-LD WebPage builder. No VideoObject, no MP4 contentUrl.
 */

import { describe, expect, it } from "vitest";
import { buildWebPageJsonLd } from "../../src/share/jsonLd";
import { buildRecordingCanonicalUrl, buildRecordCanonicalUrl } from "../../src/share/urls";
import { PROD_ORIGIN } from "./fixtures";

describe("buildWebPageJsonLd (AC-37)", () => {
  it("emits schema.org WebPage for a recording canonical URL", () => {
    const url = buildRecordingCanonicalUrl(PROD_ORIGIN, "rec_test_1");
    const ld = buildWebPageJsonLd({
      url,
      name: "Climbed 100m on Doomstack",
      description: "Watch this 100m climb on Doomstack.",
    });
    expect(ld["@context"]).toContain("schema.org");
    expect(ld["@type"]).toBe("WebPage");
    expect(ld.url).toBe(url);
    expect(ld["@type"]).not.toBe("VideoObject");
    expect(ld).not.toHaveProperty("contentUrl");
    expect(JSON.stringify(ld)).not.toMatch(/\.mp4/i);
  });

  it("emits WebPage for a record-page canonical URL", () => {
    const url = buildRecordCanonicalUrl(PROD_ORIGIN, "alpha-stack");
    const ld = buildWebPageJsonLd({
      url,
      name: "Alpha Stack — Stack",
      description: "Stack record page for Alpha Stack.",
    });
    expect(ld["@type"]).toBe("WebPage");
    expect(ld.url).toBe(url);
    expect(JSON.stringify(ld)).not.toContain("VideoObject");
  });
});
