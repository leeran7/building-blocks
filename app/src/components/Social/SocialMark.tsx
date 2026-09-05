/**
 * SocialMark — small platform glyph for creator listings (TikTok / X / YouTube).
 *
 * Original, stylised geometry (not the trademarked brand logos) so a listing that
 * points at a social account reads as a native card. Monochrome (inherits
 * `currentColor`) so it sits inside the ASCENT palette wherever it's placed.
 * Decorative by default (aria-hidden); pass a `title` to make it a labelled image.
 *
 * Carries `data-social-platform` so tests can assert the right glyph per type.
 */

import type { CreatorPlatform } from "@prisma/client";

export function SocialMark({
  platform,
  className = "h-4 w-4",
  title,
}: {
  platform: CreatorPlatform;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-social-platform={platform}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {platform === "TIKTOK" && (
        // Stylised eighth-note: a stem with a note head and a flag.
        <>
          <path
            d="M13 4v9.2a3.3 3.3 0 1 1-2.2-3.11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13 5.2c.7 1.9 2.3 3.1 4.2 3.3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {platform === "X" && (
        // Two crossing strokes.
        <path
          d="M5 5l14 14M19 5L5 19"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {platform === "YOUTUBE" && (
        // Rounded screen with a play triangle.
        <>
          <rect
            x="3"
            y="6"
            width="18"
            height="12"
            rx="3.2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M10.5 9.3l4.2 2.7-4.2 2.7z" fill="currentColor" />
        </>
      )}
      {platform === "INSTAGRAM" && (
        // Rounded square, inner ring, and a corner dot.
        <>
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="4.5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="2" />
          <circle cx="16.6" cy="7.4" r="1.1" fill="currentColor" />
        </>
      )}
      {platform === "TWITCH" && (
        // Chat/stream tab with a spout and two viewer ticks.
        <>
          <path
            d="M5 4h13v9l-3.5 3.5H11L8 20v-3.5H5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10.5 8v3.5M14.5 8v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
