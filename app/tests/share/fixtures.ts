/** Shared fixtures for climb-recording share SEO tests. Spec A-11 / AC-38. */

export const PROD_ORIGIN = "https://www.doomstack.lol";
export const HOMEPAGE_OG_TITLE = "Doomstack — Altitude is permanent";

export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** AC-38 positive bot fixtures — TikTok/ByteDance must not rely on generic `spider`. */
export const BOT_UA = {
  twitter: "Mozilla/5.0 (compatible; Twitterbot/1.0)",
  google:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  tiktok: "TikTok",
  bytespider: "Mozilla/5.0 (Linux; Android 8.0) Bytespider",
  bytedance: "ByteDance",
} as const;

export function sampleRecording(
  overrides: { id?: string; peakY?: number; handle?: string | null } = {}
): { id: string; peakY: number; handle: string | null } {
  return {
    id: "rec_test_1",
    peakY: 100,
    handle: "Maya",
    ...overrides,
  };
}

/** Next Metadata `twitter` is a union; card is only on some members. */
export function twitterCard(twitter: unknown): string | undefined {
  if (twitter && typeof twitter === "object" && "card" in twitter) {
    const card = (twitter as { card?: unknown }).card;
    return typeof card === "string" ? card : undefined;
  }
  return undefined;
}
