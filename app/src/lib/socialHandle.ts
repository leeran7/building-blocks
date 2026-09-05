/**
 * Social handle normalisation for paid listings that point at a creator's
 * TikTok / X / YouTube account instead of a website.
 *
 * A seller types a bare handle (no OAuth). We normalise it, validate the
 * per-platform charset, and build the canonical profile URL that gets stored in
 * `Block.url` — so the tower, record page and dashboard keep working unchanged,
 * while `Block.platform` + `Block.handle` drive the native card rendering.
 *
 * Pure + deterministic (no network, no DB) so it is unit-testable, mirroring
 * validateUrl.ts / sanitizeName.ts.
 */

import type { CreatorPlatform } from "@prisma/client";

export const SOCIAL_PLATFORMS: readonly CreatorPlatform[] = [
  "TIKTOK",
  "X",
  "YOUTUBE",
  "INSTAGRAM",
  "TWITCH",
] as const;

export interface PlatformMeta {
  /** Human label for pickers/cards. */
  label: string;
  /** Base the handle is appended to, to form the canonical profile URL. */
  profileBase: string;
  /** Hosts (without leading www.) that identify a pasted profile URL. */
  hosts: string[];
  /** Max handle length for this platform. */
  maxLen: number;
  /** Allowed handle shape after stripping a leading "@". */
  pattern: RegExp;
  /** Example handle shown as a placeholder. */
  example: string;
  /**
   * First path segments that are NOT usernames (used only by URL auto-detection
   * to avoid mislabeling e.g. youtube.com/channel/… or x.com/home as a handle).
   */
  reserved?: string[];
}

export const PLATFORM_META: Record<CreatorPlatform, PlatformMeta> = {
  TIKTOK: {
    label: "TikTok",
    profileBase: "https://www.tiktok.com/@",
    hosts: ["tiktok.com"],
    maxLen: 24,
    pattern: /^[a-zA-Z0-9._]{1,24}$/,
    example: "yourhandle",
  },
  X: {
    label: "X",
    profileBase: "https://x.com/",
    hosts: ["x.com", "twitter.com"],
    maxLen: 15,
    pattern: /^[a-zA-Z0-9_]{1,15}$/,
    example: "yourhandle",
    reserved: ["home", "i", "search", "hashtag", "explore", "messages", "settings", "notifications"],
  },
  YOUTUBE: {
    label: "YouTube",
    profileBase: "https://www.youtube.com/@",
    hosts: ["youtube.com"],
    maxLen: 30,
    pattern: /^[a-zA-Z0-9._-]{3,30}$/,
    example: "yourchannel",
  },
  INSTAGRAM: {
    label: "Instagram",
    profileBase: "https://www.instagram.com/",
    hosts: ["instagram.com"],
    maxLen: 30,
    pattern: /^[a-zA-Z0-9._]{1,30}$/,
    example: "yourhandle",
    reserved: ["p", "reel", "reels", "explore", "stories", "direct"],
  },
  TWITCH: {
    label: "Twitch",
    profileBase: "https://www.twitch.tv/",
    hosts: ["twitch.tv"],
    maxLen: 25,
    pattern: /^[a-zA-Z0-9_]{4,25}$/,
    example: "yourchannel",
    reserved: ["directory", "videos", "settings", "subscriptions"],
  },
};

export interface HandleResult {
  valid: boolean;
  handle?: string;
  error?: string;
}

/** True when `x` is one of the supported platform strings. */
export function isSocialPlatform(x: unknown): x is CreatorPlatform {
  return (
    typeof x === "string" &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(x)
  );
}

/**
 * Pull a bare handle candidate out of whatever the user typed: a `@handle`, a
 * full profile URL, or a `path/segment`. Strips protocol, query, hash, a
 * leading `@`, and takes the last non-empty path segment when a slash is present.
 */
function extractCandidate(raw: string): string {
  let s = (raw ?? "").trim().replace(/[?#].*$/, "");
  if (s.includes("/")) {
    const parts = s.split("/").filter(Boolean);
    // Drop a protocol token ("https:") and host if present by taking the last
    // path segment — profile URLs are ".../@handle" or ".../handle".
    s = parts[parts.length - 1] ?? "";
  }
  return s.replace(/^@+/, "").trim();
}

/**
 * Normalise + validate a handle for a platform. Accepts a bare handle, an
 * `@handle`, or a pasted profile URL for that platform.
 */
export function normalizeHandle(
  platform: CreatorPlatform,
  raw: string
): HandleResult {
  const meta = PLATFORM_META[platform];
  if (!meta) return { valid: false, error: "Unknown platform" };

  const candidate = extractCandidate(raw);
  if (!candidate) return { valid: false, error: `Enter your ${meta.label} handle` };
  if (candidate.length > meta.maxLen) {
    return { valid: false, error: `${meta.label} handle is too long` };
  }
  if (!meta.pattern.test(candidate)) {
    return {
      valid: false,
      error: `That doesn't look like a valid ${meta.label} handle`,
    };
  }
  return { valid: true, handle: candidate };
}

/** Build the canonical https profile URL for a (platform, handle). */
export function profileUrl(platform: CreatorPlatform, handle: string): string {
  return PLATFORM_META[platform].profileBase + handle;
}

/** How a handle is shown in UI (all three platforms display with a leading @). */
export function handleDisplay(handle: string): string {
  return "@" + handle.replace(/^@+/, "");
}

/**
 * Detect whether a website URL is actually a social profile, so a plain
 * submission can be upgraded to a native card. Returns null for non-social URLs.
 */
export function detectSocialPlatform(
  url: string
): { platform: CreatorPlatform; handle: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  for (const platform of SOCIAL_PLATFORMS) {
    const meta = PLATFORM_META[platform];
    if (!meta.hosts.includes(host)) continue;
    const seg = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    // Profiles built with an "@" prefix (TikTok, YouTube) only live at
    // ".../@handle" — a bare first segment is a non-profile path such as
    // youtube.com/channel/… or /watch, so don't mislabel it as a handle.
    if (meta.profileBase.endsWith("@") && !seg.startsWith("@")) return null;
    // Non-username routes on host/handle platforms (x.com/home, /p/…, etc.).
    if (meta.reserved?.includes(seg.toLowerCase().replace(/^@/, ""))) return null;
    const norm = normalizeHandle(platform, seg);
    return norm.valid ? { platform, handle: norm.handle! } : null;
  }
  return null;
}
