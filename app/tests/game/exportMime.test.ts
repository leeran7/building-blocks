/**
 * Export MIME negotiation — injectable isTypeSupported (no MediaRecorder required).
 */

import { describe, it, expect } from "vitest";
import {
  EXPORT_MIME_CANDIDATES,
  pickExportMime,
} from "../../src/game/exportMime";

describe("pickExportMime", () => {
  it("prefers H.264 baseline MP4 when supported", () => {
    const choice = pickExportMime((m) => m === "video/mp4;codecs=avc1.42E01E");
    expect(choice).toEqual({
      mimeType: "video/mp4;codecs=avc1.42E01E",
      extension: "mp4",
      label: "MP4",
    });
  });

  it("falls through mp4 codecs then container then webm", () => {
    const supported = new Set([
      "video/webm;codecs=vp9",
      "video/webm",
    ]);
    const choice = pickExportMime((m) => supported.has(m));
    expect(choice?.mimeType).toBe("video/webm;codecs=vp9");
    expect(choice?.extension).toBe("webm");
    expect(choice?.label).toBe("WebM");
  });

  it("never labels WebM as MP4", () => {
    const choice = pickExportMime((m) => m === "video/webm");
    expect(choice?.label).toBe("WebM");
    expect(choice?.extension).toBe("webm");
    expect(choice?.label).not.toBe("MP4");
  });

  it("returns null when nothing is supported (AC-17)", () => {
    expect(pickExportMime(() => false)).toBeNull();
  });

  it("probes candidates in the locked architecture order", () => {
    expect([...EXPORT_MIME_CANDIDATES]).toEqual([
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4;codecs=avc1.4D401E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ]);
    const seen: string[] = [];
    pickExportMime((m) => {
      seen.push(m);
      return false;
    });
    expect(seen).toEqual([...EXPORT_MIME_CANDIDATES]);
  });
});
