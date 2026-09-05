import { describe, it, expect } from "vitest";
import {
  normalizeHandle,
  profileUrl,
  handleDisplay,
  detectSocialPlatform,
  isSocialPlatform,
  SOCIAL_PLATFORMS,
  PLATFORM_META,
} from "../../src/lib/socialHandle";
import { validateUrl } from "../../src/lib/validateUrl";

describe("socialHandle — normalizeHandle", () => {
  it("strips a leading @ and accepts a bare handle", () => {
    const r = normalizeHandle("TIKTOK", "@myhandle");
    expect(r.valid).toBe(true);
    expect(r.handle).toBe("myhandle");
  });

  it("extracts the handle from a pasted profile URL", () => {
    expect(normalizeHandle("TIKTOK", "https://www.tiktok.com/@creator").handle).toBe(
      "creator"
    );
    expect(normalizeHandle("X", "https://x.com/someone").handle).toBe("someone");
    expect(
      normalizeHandle("YOUTUBE", "https://youtube.com/@chan_nel").handle
    ).toBe("chan_nel");
  });

  it("enforces per-platform charset + length", () => {
    // X handles are <=15 and underscores only.
    expect(normalizeHandle("X", "a".repeat(16)).valid).toBe(false);
    expect(normalizeHandle("X", "has-dash").valid).toBe(false);
    // Twitch requires >=4 chars.
    expect(normalizeHandle("TWITCH", "ab").valid).toBe(false);
    expect(normalizeHandle("TWITCH", "streamer").valid).toBe(true);
    // Instagram allows dots + underscores.
    expect(normalizeHandle("INSTAGRAM", "in.sta_gram").valid).toBe(true);
  });

  it("rejects empty input", () => {
    expect(normalizeHandle("TIKTOK", "   ").valid).toBe(false);
    expect(normalizeHandle("TIKTOK", "@").valid).toBe(false);
  });
});

describe("socialHandle — profileUrl builds a valid, safe URL", () => {
  it("produces the canonical profile URL per platform", () => {
    expect(profileUrl("TIKTOK", "creator")).toBe("https://www.tiktok.com/@creator");
    expect(profileUrl("X", "creator")).toBe("https://x.com/creator");
    expect(profileUrl("INSTAGRAM", "creator")).toBe(
      "https://www.instagram.com/creator"
    );
    expect(profileUrl("TWITCH", "creator")).toBe("https://www.twitch.tv/creator");
  });

  it("every built URL passes validateUrl (defense-in-depth)", () => {
    for (const p of SOCIAL_PLATFORMS) {
      const norm = normalizeHandle(p, "goodhandle");
      expect(norm.valid).toBe(true);
      const res = validateUrl(profileUrl(p, norm.handle!));
      expect(res.valid).toBe(true);
    }
  });
});

describe("socialHandle — detectSocialPlatform", () => {
  it("recognises known social hosts and pulls the handle", () => {
    expect(detectSocialPlatform("https://www.tiktok.com/@creator")).toEqual({
      platform: "TIKTOK",
      handle: "creator",
    });
    expect(detectSocialPlatform("https://twitch.tv/streamer")).toEqual({
      platform: "TWITCH",
      handle: "streamer",
    });
    expect(detectSocialPlatform("https://twitter.com/legacy")).toEqual({
      platform: "X",
      handle: "legacy",
    });
  });

  it("returns null for a non-social URL", () => {
    expect(detectSocialPlatform("https://example.com/page")).toBeNull();
    expect(detectSocialPlatform("not a url")).toBeNull();
  });

  it("does not mislabel non-profile paths as handles", () => {
    // @-style profiles (YouTube/TikTok) require an @ segment.
    expect(detectSocialPlatform("https://youtube.com/channel/UC12345")).toBeNull();
    expect(detectSocialPlatform("https://youtube.com/watch?v=abc")).toBeNull();
    // Reserved routes on host/handle platforms are not usernames.
    expect(detectSocialPlatform("https://x.com/home")).toBeNull();
    expect(detectSocialPlatform("https://instagram.com/p/xyz")).toBeNull();
  });
});

describe("socialHandle — helpers", () => {
  it("handleDisplay always shows a single leading @", () => {
    expect(handleDisplay("name")).toBe("@name");
    expect(handleDisplay("@name")).toBe("@name");
  });

  it("isSocialPlatform guards the enum", () => {
    expect(isSocialPlatform("TIKTOK")).toBe(true);
    expect(isSocialPlatform("MYSPACE")).toBe(false);
    expect(isSocialPlatform(123)).toBe(false);
  });

  it("every platform has complete metadata", () => {
    for (const p of SOCIAL_PLATFORMS) {
      const m = PLATFORM_META[p];
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.profileBase.startsWith("https://")).toBe(true);
      expect(m.hosts.length).toBeGreaterThan(0);
    }
  });
});
