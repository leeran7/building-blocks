"use client";

/**
 * BlockRow — a single block in the tower.
 *
 * Redesign notes:
 * - The row now *shows altitude*: a themed proportion fill behind the content
 *   whose width = altitude / tower-max. This turns the flat list into a
 *   readable vertical bar chart — the product's core spatial idea.
 * - Fully accent-themed via `--accent-rgb` (text-accent / bg-accent / etc.), so
 *   each category tower is genuinely its own color instead of hardcoded cyan.
 * - Rank #1 is celebrated (accent ring + glow + filled badge); ranks 2–3 get a
 *   podium treatment.
 *
 * PRESERVED (do not change — engine/animation invariants):
 * - Renders as <a> elements, not canvas (AC-21)
 * - Buried blocks greyed but clickable (AC-24); amber edge indicator (AC-25)
 * - CSS keyframe sway only, no physics library (AC-29)
 * - Rank-change FLIP hooks: block-slide-in class + data-* attributes
 * - Keyboard accessible (AC-23)
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
  /** Highest altitude in this tower (rank-1) — used to scale the altitude bar. */
  maxAltitude?: number;
  /** Animation delay derived from block.id (AC-29) */
  swayDelay?: number;
  /** Whether this block had a rank change (triggers FLIP animation) */
  rankChanged?: boolean;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
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
  maxAltitude = 0,
  rankChanged = false,
}: BlockRowProps) {
  // Derive animation delay from block ID (AC-29 — no physics library)
  const idHash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const animDelay = (idHash % 3000) / 1000; // 0-3s delay

  // Altitude proportion — the spatial cue. Floor at 3% so tiny blocks stay visible.
  const pct =
    maxAltitude > 0
      ? Math.min(100, Math.max(3, (altitude / maxAltitude) * 100))
      : 3;

  const isLeader = rank === 1 && !buried;
  const isPodium = rank <= 3 && !buried;

  const rowClasses = [
    "group relative flex items-center gap-3 pl-3 pr-2.5 py-2.5 rounded-xl border overflow-hidden min-h-[56px]",
    "transition-colors duration-200",
    buried
      ? "border-danger/25 bg-danger/[0.03] block-buried"
      : isLeader
        ? "border-accent/50 bg-accent/[0.06]"
        : isPodium
          ? "border-border-strong bg-surface hover:bg-elevated"
          : "border-border-subtle bg-surface/40 hover:bg-elevated hover:border-border-strong",
    !buried ? "block-sway" : "",
    amber_edge && !buried ? "amber-edge" : "",
    rankChanged ? "block-slide-in" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClasses}
      style={!buried ? { animationDelay: `${animDelay}s` } : undefined}
      data-block-id={id}
      data-rank={rank}
      data-buried={buried}
      data-amber={amber_edge}
    >
      {/* Altitude proportion fill — reads as a horizontal bar behind content */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${pct}%`,
          background: buried
            ? "linear-gradient(90deg, rgba(255,84,112,0.10) 0%, transparent 100%)"
            : "linear-gradient(90deg, rgb(var(--accent-rgb) / 0.16) 0%, rgb(var(--accent-rgb) / 0.02) 100%)",
        }}
      />

      {/* Rank badge */}
      <span
        className={[
          "relative z-10 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold",
          buried
            ? "border border-danger/40 text-danger/70"
            : isLeader
              ? "bg-accent text-void"
              : isPodium
                ? "border border-accent/60 text-accent"
                : "border border-border-strong text-text-secondary",
        ].join(" ")}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>

      {/* Name + domain */}
      <div className="relative z-10 flex-1 min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "block text-sm font-semibold truncate transition-colors",
            buried
              ? "text-text-disabled hover:text-text-muted"
              : "text-text-primary hover:text-accent",
          ].join(" ")}
          aria-label={`${display_name}${buried ? " (buried)" : ""}${
            amber_edge && !buried ? " (near burial risk)" : ""
          } — opens external site`}
        >
          {display_name}
        </a>
        <span
          className={[
            "block text-xs font-mono truncate mt-0.5",
            buried ? "text-text-disabled" : "text-text-muted",
          ].join(" ")}
        >
          {domainOf(url)}
        </span>
      </div>

      {/* Status chip */}
      {buried ? (
        <span className="relative z-10 flex-shrink-0 text-[10px] font-semibold text-danger uppercase tracking-wider">
          Buried
        </span>
      ) : amber_edge ? (
        <span
          className="relative z-10 flex-shrink-0 text-xs text-warning"
          aria-label="Near burial risk"
          title="Altitude is close to ground level"
        >
          ▲
        </span>
      ) : null}

      {/* Altitude value */}
      <div className="relative z-10 flex-shrink-0 text-right leading-none">
        <span
          className={[
            "font-mono text-sm font-bold tabular-nums",
            buried
              ? "text-text-disabled"
              : isLeader
                ? "text-accent"
                : "text-text-primary",
          ].join(" ")}
          aria-label={`${altitude.toFixed(1)} metres`}
        >
          {altitude.toFixed(1)}
          <span className="text-text-muted font-normal">m</span>
        </span>
      </div>

      {/* Top up — reveals on hover/focus */}
      <a
        href={`/b/${slug}`}
        className={[
          "relative z-10 flex-shrink-0 text-xs font-semibold rounded-md px-2.5 py-1.5 transition-all min-h-[32px] inline-flex items-center",
          "opacity-0 -mr-1 w-0 overflow-hidden px-0",
          "group-hover:opacity-100 group-hover:w-auto group-hover:px-2.5 group-hover:mr-0",
          "group-focus-within:opacity-100 group-focus-within:w-auto group-focus-within:px-2.5 group-focus-within:mr-0",
          buried
            ? "text-text-muted hover:text-text-primary"
            : "bg-accent text-void hover:brightness-110",
        ].join(" ")}
        aria-label={`Top up ${display_name}`}
      >
        Top&nbsp;up&nbsp;↑
      </a>

      {/* Record page link (always visible) */}
      <a
        href={`/b/${slug}`}
        className={[
          "relative z-10 flex-shrink-0 w-7 h-7 rounded-md inline-flex items-center justify-center text-sm transition-colors",
          buried
            ? "text-text-disabled hover:text-text-muted"
            : "text-text-muted hover:text-accent hover:bg-elevated",
        ].join(" ")}
        aria-label={`View record page for ${display_name}`}
      >
        ↗
      </a>
    </div>
  );
}
