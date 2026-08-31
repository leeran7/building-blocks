/**
 * OG image dimensions and Cache-Control. Recording s-maxage ≥ 3600;
 * listing stays 60.
 */

import type { OgVariant } from "../share/types";

export const OG_LANDSCAPE_WIDTH = 1200;
export const OG_LANDSCAPE_HEIGHT = 630;
export const OG_SQUARE_SIZE = 1080;

export const LISTING_OG_CACHE_CONTROL =
  "s-maxage=60, stale-while-revalidate=300";

export const RECORDING_OG_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

export const RECORD_OG_CACHE_CONTROL = RECORDING_OG_CACHE_CONTROL;

export const SHARE_JSON_CACHE_CONTROL = RECORDING_OG_CACHE_CONTROL;

export interface OgImageSize {
  width: number;
  height: number;
}

export function listingOgImageOptions(): OgImageSize {
  return { width: OG_LANDSCAPE_WIDTH, height: OG_LANDSCAPE_HEIGHT };
}

export function recordingOgImageOptions(variant: OgVariant): OgImageSize {
  if (variant === "square") {
    return { width: OG_SQUARE_SIZE, height: OG_SQUARE_SIZE };
  }
  return { width: OG_LANDSCAPE_WIDTH, height: OG_LANDSCAPE_HEIGHT };
}

export function recordOgImageOptions(): OgImageSize {
  return { width: OG_LANDSCAPE_WIDTH, height: OG_LANDSCAPE_HEIGHT };
}
