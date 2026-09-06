/**
 * Export delivery decision — invoke production units (AC-SI-1…3).
 * No source-text greps (kernel gates).
 */

import { describe, it, expect } from "vitest";
import {
  exportSuccessLabel,
  resolveExportDelivery,
} from "../../src/game/exportDelivery";

describe("resolveExportDelivery", () => {
  it("skips download and attempts share when canShare is true (AC-SI-1, AC-SI-3)", () => {
    expect(resolveExportDelivery(true)).toEqual({
      download: false,
      attemptShare: true,
      delivery: "share",
    });
  });

  it("downloads and does not auto-share when canShare is false (AC-SI-2)", () => {
    expect(resolveExportDelivery(false)).toEqual({
      download: true,
      attemptShare: false,
      delivery: "download",
    });
  });
});

describe("exportSuccessLabel", () => {
  it("uses Ready to share for share delivery (AC-SI)", () => {
    expect(exportSuccessLabel("MP4", "share", false)).toBe("Ready to share MP4");
    expect(exportSuccessLabel("WebM", "share", true)).toBe("Ready to share WebM");
  });

  it("uses Downloaded for download delivery", () => {
    expect(exportSuccessLabel("MP4", "download", false)).toBe("Downloaded MP4");
    // Live canShare must not override an explicit download delivery.
    expect(exportSuccessLabel("WebM", "download", true)).toBe("Downloaded WebM");
  });

  it("falls back to canShare when delivery is omitted", () => {
    expect(exportSuccessLabel("MP4", undefined, true)).toBe("Ready to share MP4");
    expect(exportSuccessLabel("MP4", undefined, false)).toBe("Downloaded MP4");
  });
});
