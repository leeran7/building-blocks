import { describe, it, expect } from "vitest";
import { safeInternalPath } from "../../src/lib/safeRedirect";

describe("safeInternalPath — open-redirect guard", () => {
  it("allows safe internal paths", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/play/ai-and-ml-tools")).toBe("/play/ai-and-ml-tools");
    expect(safeInternalPath("/submit?category=fintech")).toBe("/submit?category=fintech");
  });

  it("rejects off-site + protocol-relative + tricks → fallback", () => {
    const cases = [
      "https://evil.com",
      "http://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      null,
      undefined,
    ];
    for (const c of cases) {
      expect(safeInternalPath(c as string | null)).toBe("/dashboard");
    }
  });

  it("honors a custom fallback", () => {
    expect(safeInternalPath("//evil.com", "/")).toBe("/");
  });

  it("rejects control-char smuggling", () => {
    expect(safeInternalPath("/foo\nhttps://evil.com")).toBe("/dashboard");
  });
});
