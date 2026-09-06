/**
 * Native share helper — invoke production units with fake canShare/share.
 * No source-text greps (kernel gates / AC-NS verification notes).
 */

import { describe, it, expect, vi } from "vitest";
import {
  canShareVideoFile,
  shareVideoFile,
} from "../../src/game/shareVideoFile";

function videoFile(
  name: string,
  type: string,
  bytes: number[] = [1, 2, 3, 4]
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function firstCallPayload(fn: {
  mock: { calls: unknown[][] };
}): ShareData {
  const call = fn.mock.calls[0];
  if (!call || call.length === 0) {
    throw new Error("expected at least one call with a ShareData payload");
  }
  return call[0] as ShareData;
}

describe("canShareVideoFile", () => {
  it("returns true when canShare accepts files-only payload (AC-NS-1)", () => {
    const file = videoFile("climb-99m-20260906.mp4", "video/mp4");
    const canShare = vi.fn((_data: ShareData) => true);
    expect(canShareVideoFile(file, { canShare })).toBe(true);
    expect(canShare).toHaveBeenCalledTimes(1);
    const payload = firstCallPayload(canShare);
    expect(payload).toEqual({ files: [file] });
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("text");
  });

  it("returns false when canShare is missing, false, or throws (AC-NS-1 negative)", () => {
    const file = videoFile("climb-1m-20260906.mp4", "video/mp4");
    expect(canShareVideoFile(file, {})).toBe(false);
    expect(canShareVideoFile(file, { canShare: () => false })).toBe(false);
    expect(
      canShareVideoFile(file, {
        canShare: () => {
          throw new Error("boom");
        },
      })
    ).toBe(false);
  });

  it("probes WebM with video/webm — never forged mp4 (AC-NS-8)", () => {
    const file = videoFile("climb-50m-20260906.webm", "video/webm");
    const canShare = vi.fn((_data: ShareData) => true);
    expect(canShareVideoFile(file, { canShare })).toBe(true);
    const payload = firstCallPayload(canShare);
    expect(payload.files?.[0]?.type).toBe("video/webm");
    expect(payload.files?.[0]?.name).toMatch(/\.webm$/);
  });
});

describe("shareVideoFile", () => {
  it("shares files payload and optional title only on share() (AC-NS-4)", async () => {
    const file = videoFile("climb-99m-20260906.mp4", "video/mp4");
    const canShare = vi.fn((_data: ShareData) => true);
    const share = vi.fn(async (_data: ShareData) => undefined);
    const result = await shareVideoFile(file, {
      title: file.name,
      deps: { canShare, share },
    });
    expect(result).toEqual({ ok: true });
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file], title: file.name });
  });

  it("returns unsupported without calling share when canShare is false", async () => {
    const file = videoFile("climb-1m-20260906.mp4", "video/mp4");
    const share = vi.fn(async (_data: ShareData) => undefined);
    const result = await shareVideoFile(file, {
      deps: { canShare: () => false, share },
    });
    expect(result).toEqual({ ok: false, reason: "unsupported" });
    expect(share).not.toHaveBeenCalled();
  });

  it("maps AbortError to aborted (AC-NS-5)", async () => {
    const file = videoFile("climb-99m-20260906.mp4", "video/mp4");
    const err = new Error("cancelled");
    err.name = "AbortError";
    const result = await shareVideoFile(file, {
      deps: {
        canShare: () => true,
        share: async () => {
          throw err;
        },
      },
    });
    expect(result).toEqual({ ok: false, reason: "aborted" });
  });

  it("maps non-abort rejection to error with non-empty message (AC-NS-6)", async () => {
    const file = videoFile("climb-99m-20260906.mp4", "video/mp4");
    const err = new Error("NotAllowedError");
    err.name = "NotAllowedError";
    const result = await shareVideoFile(file, {
      deps: {
        canShare: () => true,
        share: async () => {
          throw err;
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "error") {
      expect(result.message.length).toBeGreaterThan(0);
    } else {
      expect.fail("expected error reason");
    }
  });

  it("falls back to Share failed when reject has empty message", async () => {
    const file = videoFile("climb-99m-20260906.mp4", "video/mp4");
    const err = new Error("");
    err.name = "DataError";
    const result = await shareVideoFile(file, {
      deps: {
        canShare: () => true,
        share: async () => {
          throw err;
        },
      },
    });
    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "Share failed",
    });
  });

  it("shares WebM file with video/webm type (AC-NS-8)", async () => {
    const file = videoFile("climb-50m-20260906.webm", "video/webm");
    const share = vi.fn(async (_data: ShareData) => undefined);
    const result = await shareVideoFile(file, {
      deps: { canShare: () => true, share },
    });
    expect(result).toEqual({ ok: true });
    const payload = firstCallPayload(share);
    expect(payload.files?.[0]?.type).toBe("video/webm");
    expect(payload.files?.[0]?.name).toBe("climb-50m-20260906.webm");
  });
});
