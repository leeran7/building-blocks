"use client";

/**
 * BlockCard — a single owned block on the dashboard.
 *
 * AC-18: shows category, rank, altitude (mono), and views served
 * AC-19: AltitudeChart present per card
 * AC-20: single-point chart works
 * AC-21–25: burial risk + competitor cost (delegated to subcomponents)
 * R-4: AltitudeChart loaded via dynamic import ssr:false
 *
 * Category is resolved via getCategory() so any category (curated or future)
 * themes correctly. Accent is used functionally — the category dot, the
 * altitude figure, and the top-up action — not as decoration.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import type { CreatorPlatform } from "@prisma/client";
import { BurialRisk } from "./BurialRisk";
import { CompetitorCost } from "./CompetitorCost";
import { getCategory, categoryTheme } from "../../lib/categories";
import { ALTITUDE_UNIT, formatAltitudeLabel } from "../../lib/units";
import { SocialMark } from "../Social/SocialMark";
import { PLATFORM_META, handleDisplay } from "../../lib/socialHandle";

const AltitudeChart = dynamic(() => import("./AltitudeChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[120px] bg-surface-raised rounded-lg animate-pulse" />
  ),
});

interface Payment {
  id: string;
  amount_cents: number;
  metres_added: number;
  created_at: string;
}

interface Season {
  id: string;
  views_k: number;
  category: string;
}

interface DashboardBlock {
  id: string;
  slug: string;
  display_name: string;
  url: string;
  category: string;
  altitude: number;
  rank: number;
  rank_above_altitude: number | null;
  views_served: number;
  spend_c: number;
  buried: boolean;
  amber_edge: boolean;
  burial_risk_days: number | null;
  competitor_cost_usd: number | null;
  season: Season;
  payments: Payment[];
  platform?: CreatorPlatform | null;
  handle?: string | null;
}

interface BlockCardProps {
  block: DashboardBlock;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function BlockCard({ block }: BlockCardProps) {
  const cat = getCategory(block.category);

  return (
    <article
      aria-label={`${block.display_name} block`}
      style={categoryTheme(cat)}
      className={[
        "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-lifted",
        block.buried ? "border-ember/40" : "border-border-strong edge-signal",
      ].join(" ")}
    >
      {/* survey-grid backdrop */}
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" />
      {block.buried && (
        <div
          className="ground-gradient animate-groundRise pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-50"
          aria-hidden="true"
        />
      )}

      <div className="relative">
        {/* Meta row: category + rank */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-secondary">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: cat.hex }}
              aria-hidden="true"
            />
            {cat.label}
          </span>
          <div className="flex items-center gap-2">
            {block.buried && (
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ember bg-ember/10 border border-ember/30 rounded px-1.5 py-0.5">
                Buried
              </span>
            )}
            <span className="font-mono text-xs text-text-muted tabular-nums">
              Rank {block.rank}
            </span>
          </div>
        </div>

        {/* Title + domain */}
        <h2 className="font-display text-xl text-text-primary mt-3 truncate">
          {block.display_name}
        </h2>
        {block.platform && block.handle ? (
          <p
            className="flex items-center gap-1 text-xs font-mono text-text-secondary truncate mt-0.5"
            title={`${PLATFORM_META[block.platform].label} · ${handleDisplay(block.handle)}`}
            aria-label={`${PLATFORM_META[block.platform].label} ${handleDisplay(block.handle)}`}
          >
            <SocialMark platform={block.platform} className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{handleDisplay(block.handle)}</span>
          </p>
        ) : (
          <p className="text-xs font-mono text-text-secondary truncate mt-0.5">
            {domainOf(block.url)}
          </p>
        )}

        {/* Primary metrics */}
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-0.5">
              Altitude
            </p>
            <p
              className={[
                "font-mono text-4xl font-bold leading-none tabular-nums",
                block.buried ? "text-ember" : "text-signal",
              ].join(" ")}
              aria-label={`Current altitude: ${formatAltitudeLabel(block.altitude, 1)}`}
            >
              {block.altitude.toFixed(1)}
              <span className="text-lg text-text-muted font-normal">{ALTITUDE_UNIT}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-0.5">
              Views served
            </p>
            <p className="font-mono text-lg font-semibold text-text-primary tabular-nums">
              {block.views_served.toLocaleString()}
            </p>
          </div>
        </div>

      {/* Altitude history */}
      <div className="mt-4">
        <AltitudeChart
          payments={block.payments}
          categoryAccent={cat.hex}
          displayName={block.display_name}
        />
      </div>

      <div className="border-t border-border-subtle my-4" />

      <BurialRisk
        burialRiskDays={block.burial_risk_days}
        buried={block.buried}
        amberEdge={block.amber_edge}
      />

      <div className="border-t border-border-subtle my-4" />

      <CompetitorCost
        competitorCostUsd={block.competitor_cost_usd}
        rank={block.rank}
        category={cat.label}
      />

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/b/${block.slug}`}
            className="flex-1 text-center text-sm font-semibold rounded-full py-2.5 bg-signal text-void shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform] min-h-[44px] inline-flex items-center justify-center"
            aria-label={`Top up ${block.display_name}`}
          >
            Top up ↑
          </Link>
          <Link
            href={`/b/${block.slug}`}
            className="text-sm font-medium rounded-full px-4 py-2.5 border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary transition min-h-[44px] inline-flex items-center"
            aria-label={`View record page for ${block.display_name}`}
          >
            Record
          </Link>
        </div>
      </div>
    </article>
  );
}
