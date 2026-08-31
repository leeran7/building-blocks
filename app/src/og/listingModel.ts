/**
 * Listing OG query-param model. Missing params keep A-12 defaults after
 * sanitizing any provided values. Never throws.
 */

import { OG_PALETTE, type OgPalette } from "./palette";
import { sanitizeOgText } from "./sanitize";

export const LISTING_OG_NAME_MAX = 80;
export const LISTING_OG_RANK_MAX = 8;

export const LISTING_OG_DEFAULTS = {
  name: "Stack",
  alt: "0",
  rank: "1",
} as const;

export interface ListingOgModel {
  name: string;
  alt: string;
  rank: string;
  palette: OgPalette;
}

export function buildListingOgModel(params: {
  name: string | null;
  alt: string | null;
  rank: string | null;
}): ListingOgModel {
  const name =
    params.name == null || params.name === ""
      ? LISTING_OG_DEFAULTS.name
      : sanitizeOgText(params.name, LISTING_OG_NAME_MAX) || LISTING_OG_DEFAULTS.name;

  const alt = parseListingAlt(params.alt);

  const rank =
    params.rank == null || params.rank === ""
      ? LISTING_OG_DEFAULTS.rank
      : sanitizeOgText(params.rank, LISTING_OG_RANK_MAX) || LISTING_OG_DEFAULTS.rank;

  return { name, alt, rank, palette: OG_PALETTE };
}

function parseListingAlt(raw: string | null): string {
  if (raw == null || raw === "") return LISTING_OG_DEFAULTS.alt;
  const n = Number(raw);
  if (!Number.isFinite(n)) return LISTING_OG_DEFAULTS.alt;
  return String(n);
}
