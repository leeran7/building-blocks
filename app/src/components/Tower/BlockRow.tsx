"use client";

/**
 * BlockRow — Single block row in the tower.
 *
 * CRITICAL:
 * - Renders as <a> element (AC-21) — not canvas
 * - Buried blocks are greyed but remain clickable (AC-24)
 * - Amber edge indicator when clearance < 1.6*ground (AC-25)
 * - Keyboard accessible (AC-23)
 * - CSS keyframe sway only, no physics library (AC-29)
 */

import React from "react";

export interface BlockRowProps {
  id: string;
  slug: string;
  url: string;
  display_name: string;
  altitude: number;
  rank: number;
  buried: boolean;
  amber_edge: boolean;
  views_served: number;
  /** Animation delay derived from block.id (AC-29) */
  swayDelay?: number;
  /** Whether this block had a rank change (triggers FLIP animation) */
  rankChanged?: boolean;
}

export function BlockRow({
  id,
  slug,
  url,
  display_name,
  altitude,
  rank,
  buried,
  amber_edge,
  views_served,
  swayDelay = 0,
  rankChanged = false,
}: BlockRowProps) {
  // Derive animation delay from block ID (AC-29 — no physics library)
  // Use character codes of id for deterministic delay
  const idHash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const animDelay = (idHash % 3000) / 1000; // 0-3s delay

  const baseClasses = [
    "flex items-center gap-3 px-4 py-2.5 border border-tower-border rounded-sm",
    "transition-colors hover:bg-tower-surface/60",
    "focus-within:ring-2 focus-within:ring-tower-sky focus-within:ring-offset-1 focus-within:ring-offset-tower-base",
    buried ? "block-buried" : "block-sway",
    amber_edge && !buried ? "amber-edge" : "",
    rankChanged ? "block-slide-in" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={baseClasses}
      style={
        !buried
          ? {
              animationDelay: `${animDelay}s`,
            }
          : undefined
      }
      data-block-id={id}
      data-rank={rank}
      data-buried={buried}
      data-amber={amber_edge}
    >
      {/* Rank number */}
      <span
        className={`text-xs font-mono w-8 text-right flex-shrink-0 ${
          buried ? "text-tower-buried" : "text-tower-muted"
        }`}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>

      {/* Block link — AC-21: real <a> element for middle-click etc. */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex-1 text-sm font-medium truncate min-w-0 ${
          buried
            ? "text-tower-buried hover:text-tower-muted"
            : "text-tower-text hover:text-tower-sky"
        }`}
        aria-label={`${display_name}${buried ? " (buried)" : ""}${amber_edge && !buried ? " (near burial risk)" : ""} — opens external site`}
      >
        {display_name}
      </a>

      {/* Amber edge warning indicator (AC-25) */}
      {amber_edge && !buried && (
        <span
          className="text-tower-amber text-xs flex-shrink-0"
          aria-label="Near burial risk"
          title="Altitude is close to ground level"
        >
          ▲
        </span>
      )}

      {/* Altitude */}
      <span
        className={`text-xs font-mono flex-shrink-0 ${
          buried ? "text-tower-buried" : "text-tower-muted"
        }`}
        aria-label={`${altitude.toFixed(1)} metres`}
      >
        {altitude.toFixed(1)}m
      </span>

      {/* Record page link */}
      <a
        href={`/b/${slug}`}
        className={`text-xs flex-shrink-0 ${
          buried
            ? "text-tower-buried hover:text-tower-muted"
            : "text-tower-muted hover:text-tower-sky"
        }`}
        aria-label={`View record page for ${display_name}`}
      >
        ↗
      </a>
    </div>
  );
}
