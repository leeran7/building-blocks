"use client";

/**
 * BlockRow — Single block row in the tower. V2 dark theme update.
 *
 * CRITICAL:
 * - ALL LOGIC PRESERVED from v1
 * - Only Tailwind classes updated to v2 design tokens
 * - Renders as <a> element (AC-21) — not canvas
 * - Buried blocks are greyed but remain clickable (AC-24)
 * - Amber edge indicator when clearance < 1.6*ground (AC-25)
 * - Keyboard accessible (AC-23)
 * - CSS keyframe sway only, no physics library (AC-29)
 *
 * V2 additions per design.md §6.2:
 * - bg-surface background, left border in category accent for buried
 * - Rank badge: 28×28px circle, font-mono
 * - Altitude bar with category accent gradient fill
 * - Hover expand: URL chip + Top up CTA
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
  const idHash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const animDelay = (idHash % 3000) / 1000; // 0-3s delay

  const baseClasses = [
    // V2: dark surface background, border-bottom
    "group flex items-center gap-3 px-4 py-3 border-b border-border-subtle",
    "transition-all duration-200",
    // V2: hover → elevated background, expand for URL/CTA
    "hover:bg-elevated focus-within:bg-elevated",
    // V1 animations preserved (CSS classes from globals.css)
    buried ? "block-buried" : "block-sway",
    amber_edge && !buried ? "amber-edge" : "",
    rankChanged ? "block-slide-in" : "",
    // V2: buried gets red left border (design.md §6.2)
    buried ? "border-l-4 border-l-danger" : "",
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
      {/* Rank badge — V2: 28×28 circle, font-mono */}
      <span
        className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center font-mono text-xs font-semibold text-text-primary ${
          buried
            ? "border-text-disabled opacity-50"
            : "border-text-muted"
        }`}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>

      {/* Block content — flex grows */}
      <div className="flex-1 min-w-0">
        {/* Block link — AC-21: real <a> element */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`block text-sm font-medium truncate ${
            buried
              ? "text-text-disabled hover:text-text-muted"
              : "text-text-primary hover:text-accent-tech"
          } transition-colors`}
          aria-label={`${display_name}${buried ? " (buried)" : ""}${
            amber_edge && !buried ? " (near burial risk)" : ""
          } — opens external site`}
        >
          {display_name}
        </a>

        {/* URL — visible on hover/focus */}
        <span className="block text-xs font-mono text-text-muted truncate mt-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {url.replace(/^https?:\/\//, "")}
        </span>
      </div>

      {/* Amber edge warning (AC-25) */}
      {amber_edge && !buried && (
        <span
          className="text-xs flex-shrink-0 text-danger"
          aria-label="Near burial risk"
          title="Altitude is close to ground level"
        >
          ▲
        </span>
      )}

      {/* Buried badge */}
      {buried && (
        <span className="text-xs font-semibold text-danger flex-shrink-0 uppercase tracking-wider">
          BURIED
        </span>
      )}

      {/* Altitude — font-mono */}
      <span
        className={`text-xs font-mono flex-shrink-0 ${
          buried ? "text-text-disabled" : "text-text-muted"
        }`}
        aria-label={`${altitude.toFixed(1)} metres`}
      >
        {altitude.toFixed(1)}m
      </span>

      {/* Top up CTA — visible on hover/focus */}
      <a
        href={`/b/${slug}`}
        className={`text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${
          buried
            ? "text-text-disabled hover:text-text-muted"
            : "bg-accent-tech text-void px-2.5 py-1 rounded-md font-medium hover:brightness-110"
        }`}
        aria-label={`Top up ${display_name}`}
      >
        Top up ↑
      </a>

      {/* Record page link */}
      <a
        href={`/b/${slug}`}
        className={`text-xs flex-shrink-0 ${
          buried
            ? "text-text-disabled hover:text-text-muted"
            : "text-text-muted hover:text-accent-tech"
        } transition-colors`}
        aria-label={`View record page for ${display_name}`}
      >
        ↗
      </a>
    </div>
  );
}
