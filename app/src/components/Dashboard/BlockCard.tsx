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
import { BurialRisk } from "./BurialRisk";
import { CompetitorCost } from "./CompetitorCost";
import { getCategory, categoryTheme } from "../../lib/categories";

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
        "rounded-xl border bg-surface p-5 shadow-card",
        block.buried ? "border-danger/40" : "border-border-subtle",
      ].join(" ")}
    >
      {/* Meta row: category + rank */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: cat.hex }}
            aria-hidden="true"
          />
          {cat.label}
        </span>
        <div className="flex items-center gap-2">
          {block.buried && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-danger bg-danger/10 border border-danger/30 rounded px-1.5 py-0.5">
              Buried
            </span>
          )}
          <span className="font-mono text-xs text-text-muted tabular-nums">
            Rank {block.rank}
          </span>
        </div>
      </div>

      {/* Title + domain */}
      <h2 className="text-base font-semibold text-text-primary mt-3 truncate">
        {block.display_name}
      </h2>
      <p className="text-xs font-mono text-text-muted truncate mt-0.5">
        {domainOf(block.url)}
      </p>

      {/* Primary metrics */}
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-0.5">
            Altitude
          </p>
          <p
            className="font-mono text-3xl font-bold text-accent leading-none tabular-nums"
            aria-label={`Current altitude: ${block.altitude.toFixed(1)} metres`}
          >
            {block.altitude.toFixed(1)}
            <span className="text-lg text-text-muted font-normal">m</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-0.5">
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
          className="flex-1 text-center text-sm font-semibold rounded-lg py-2.5 bg-accent text-void hover:brightness-110 transition min-h-[44px] inline-flex items-center justify-center"
          aria-label={`Top up ${block.display_name}`}
        >
          Top up ↑
        </Link>
        <Link
          href={`/b/${block.slug}`}
          className="text-sm font-medium rounded-lg px-4 py-2.5 border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary transition min-h-[44px] inline-flex items-center"
          aria-label={`View record page for ${block.display_name}`}
        >
          Record
        </Link>
      </div>
    </article>
  );
}
