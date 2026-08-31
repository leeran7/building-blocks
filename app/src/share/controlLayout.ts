/**
 * Shared layout + accessible names for recording share controls (AC-31).
 * Tokens from app/DESIGN.md — 44px targets, signal/void, not text-muted on void.
 */

export const SHARE_CONTROL_LAYOUT = {
  minHeightPx: 44,
  minWidthPx: 44,
  className:
    "min-h-[44px] min-w-[44px] inline-flex items-center justify-center",
} as const;

export const SHARE_ACTION_LABELS = {
  X: "Share on X",
  TIKTOK: "Copy TikTok caption",
  YOUTUBE: "Copy YouTube title and description",
  COPY_LINK: "Copy link",
} as const;
