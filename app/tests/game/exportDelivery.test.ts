/**
 * Export delivery decision — invoke production units (AC-SI-1…3).
 * No source-text greps (kernel gates).
 */

import { describe, it, expect, vi } from "vitest";
import {
  deliverExportFile,
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

describe("deliverExportFile", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "climb-1m-20260101.webm", {
    type: "video/webm",
  });

  it("shares and does not download when canShare is true (AC-SI-1, AC-SI-3)", async () => {
    const download = vi.fn();
    const share = vi.fn(async () => ({ ok: true as const }));
    const result = await deliverExportFile(file, {
      canShare: () => true,
      share,
      download,
    });
    expect(result.delivery).toBe("share");
    expect(result.shareResult).toEqual({ ok: true });
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(file, { title: file.name });
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads and does not share when canShare is false (AC-SI-2)", async () => {
    const download = vi.fn();
    const share = vi.fn(async () => ({ ok: true as const }));
    const result = await deliverExportFile(file, {
      canShare: () => false,
      share,
      download,
    });
    expect(result).toEqual({ delivery: "download" });
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(file, file.name);
    expect(share).not.toHaveBeenCalled();
  });

  it("returns aborted shareResult without downloading (AC-SI-3 retry path)", async () => {
    const download = vi.fn();
    const result = await deliverExportFile(file, {
      canShare: () => true,
      share: async () => ({ ok: false, reason: "aborted" }),
      download,
    });
    expect(result.delivery).toBe("share");
    expect(result.shareResult).toEqual({ ok: false, reason: "aborted" });
    expect(download).not.toHaveBeenCalled();
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
