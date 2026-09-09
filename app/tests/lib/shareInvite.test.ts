/**
 * shareInvite — native share sheet first, clipboard/prompt as fallback.
 *
 * The behaviour that matters: the share sheet is offered on EVERY browser that
 * supports it (no mobile user-agent gate), and dismissing the sheet is treated
 * as a deliberate "no" rather than silently copying instead.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { shareInvite } from "../../src/lib/shareInvite";

const LINK = "https://climb.test/duel/abc123";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shareInvite", () => {
  it("uses the native share sheet when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    expect(await shareInvite(LINK)).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: LINK }));
  });

  it("treats a dismissed sheet as done — and does NOT fall through to copying", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    expect(await shareInvite(LINK)).toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when sharing genuinely fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("permission denied"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    expect(await shareInvite(LINK)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("copies when the browser has no share support at all", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    expect(await shareInvite(LINK)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("prompts as a last resort when the clipboard is blocked", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    const prompt = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { prompt });

    expect(await shareInvite(LINK)).toBe("copied");
    expect(prompt).toHaveBeenCalled();
  });
});
