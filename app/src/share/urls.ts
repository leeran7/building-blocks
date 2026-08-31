/**
 * Marketing URL builders. Callers pass an explicit origin
 * (`resolveBaseUrl()` / `PUBLIC_CONFIG.siteUrl`). Never read Host or
 * `window.location.origin`.
 */

import type { OgVariant } from "./types";

function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** Canonical recording URL: `{origin}/r/{id}` — no trailing slash, no query. */
export function buildRecordingCanonicalUrl(
  origin: string,
  recordingId: string
): string {
  return `${stripTrailingSlash(origin)}/r/${recordingId}`;
}

export function buildRecordingOgImageUrl(
  origin: string,
  recordingId: string,
  variant: OgVariant
): string {
  const base = stripTrailingSlash(origin);
  if (variant === "square") {
    return `${base}/api/og/recording/${recordingId}/square`;
  }
  return `${base}/api/og/recording/${recordingId}`;
}

/** Record (listing) page: `{origin}/b/{slug}` — no trailing slash. */
export function buildRecordCanonicalUrl(origin: string, slug: string): string {
  return `${stripTrailingSlash(origin)}/b/${slug}`;
}

export function buildRecordOgImageUrl(origin: string, slug: string): string {
  return `${stripTrailingSlash(origin)}/api/og/b/${slug}`;
}

export const TWEET_INTENT_PREFIX = "https://twitter.com/intent/tweet?";

export function buildTweetIntentUrl(caption: string): string {
  return `${TWEET_INTENT_PREFIX}text=${encodeURIComponent(caption)}`;
}
