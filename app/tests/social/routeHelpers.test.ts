import { describe, it, expect } from "vitest";
import { safeSocialAdminPath } from "../../src/lib/safeRedirect";

describe("safeSocialAdminPath — OAuth post-connect redirect guard", () => {
  it("allows paths under /admin/social", () => {
    expect(safeSocialAdminPath("/admin/social/settings")).toBe("/admin/social/settings");
    expect(safeSocialAdminPath("/admin/social/content")).toBe("/admin/social/content");
    expect(safeSocialAdminPath("/admin/social/settings?tab=accounts")).toBe(
      "/admin/social/settings?tab=accounts"
    );
  });

  it("rejects off-site, protocol-relative, and non-social paths", () => {
    const cases = [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/dashboard",
      "/admin/other",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ];
    for (const c of cases) {
      expect(safeSocialAdminPath(c as string | null)).toBe("/admin/social/settings");
    }
  });

  it("rejects control-char smuggling", () => {
    expect(safeSocialAdminPath("/admin/social\nhttps://evil.com")).toBe("/admin/social/settings");
  });
});
