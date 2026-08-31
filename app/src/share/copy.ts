/**
 * Deterministic English copy templates for recording share payloads.
 * Peak display is integer metres. Do not claim the height is verified.
 */

export const SHARE_HASHTAGS: readonly string[] = ["doomstack", "theclimb"];

export function peakMetres(peakY: number): number {
  return Math.round(peakY);
}

export function climbTitle(peakM: number): string {
  return `Climbed ${peakM}m on Doomstack`;
}

export function climbCaption(peakM: number, url: string): string {
  return `I climbed ${peakM}m on Doomstack. Watch the replay: ${url}`;
}

export function youtubeDescription(peakM: number, url: string): string {
  return `Watch this ${peakM}m climb on Doomstack.\n\n${url}`;
}

export function shareCta(url: string): string {
  return `Watch the replay: ${url}`;
}

export const TIKTOK_COMPOSE_DETAIL =
  "TikTok has no public compose web intent. Copy the caption into the TikTok app.";

export const YOUTUBE_COMPOSE_DETAIL =
  "YouTube has no public compose web intent. Copy the title and description into YouTube Studio.";
