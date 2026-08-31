/**
 * Platform field limits (JS UTF-16 `.length`), copied as numbers so this
 * tree does not import PR #11. Over-limit ⇒ invalid; never slice.
 */

export const SHARE_FIELD_LIMITS = {
  X_CAPTION: 280,
  TIKTOK_CAPTION: 2200,
  YOUTUBE_TITLE: 100,
  YOUTUBE_DESCRIPTION: 5000,
} as const;

export interface ShareFieldLengthResult {
  valid: boolean;
  length: number;
  limit: number;
}

/**
 * Length check used by the share-payload builder.
 * Returns `{ valid, length, limit }` only — never a truncated string.
 */
export function validateShareFieldLength(
  text: string,
  limit: number
): ShareFieldLengthResult {
  const length = text.length;
  return { valid: length <= limit, length, limit };
}
