"use client";

/**
 * BlockCard — Dashboard block card with altitude chart, burial risk, competitor cost.
 *
 * Design spec: design.md §6.16
 * AC-18: Shows category, rank, altitude, views
 * AC-19: AltitudeChart present per card
 * AC-20: Single-point chart works
 * AC-21–25: Burial risk and competitor cost computed by API, displayed here
 *
 * R-4: AltitudeChart loaded via dynamic import ssr:false
 */

import type React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BurialRisk } from "./BurialRisk";
import { CompetitorCost } from "./CompetitorCost";

// R-4: Must be dynamic with ssr:false — Recharts crashes on server
const AltitudeChart = dynamic(() => import("./AltitudeChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[120px] bg-surface rounded-lg animate-pulse" />
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
  categoryAccent: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  tech: "TECH",
  design: "DESIGN",
  business: "BUSINESS",
  creative: "CREATIVE",
  gaming: "GAMING",
  science: "SCIENCE",
  Tech: "TECH",
  Design: "DESIGN",
  Business: "BUSINESS",
  Creative: "CREATIVE",
  Gaming: "GAMING",
  Science: "SCIENCE",
};

export function BlockCard({ block, categoryAccent }: BlockCardProps) {
  const categoryLabel =
    CATEGORY_LABELS[block.category] ?? block.category.toUpperCase();

  return (
    <article
      aria-label={`${block.display_name} block`}
      className={[
        "bg-surface rounded-2xl border border-border-subtle p-6",
        block.buried ? "border-l-4 border-l-danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--card-accent": categoryAccent } as React.CSSProperties}
    >
      {/* Header: category badge + top-up button */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-semibold rounded-full px-2.5 py-1 border text-text-primary uppercase"
          style={{ borderColor: categoryAccent }}
          aria-label={`${block.category} category`}
        >
          {block.buried && (
            <span className="text-danger mr-1.5">BURIED ·</span>
          )}
          {categoryLabel}
        </span>
        <Link
          href={`/b/${block.slug}`}
          className="text-sm font-medium px-3 py-1.5 rounded-lg border text-text-primary hover:bg-elevated transition-colors min-h-[36px] inline-flex items-center"
          style={{ borderColor: categoryAccent }}
          aria-label={`Top up ${block.display_name}`}
        >
          Top up ↑
        </Link>
      </div>

      {/* Block title */}
      <h2 className="text-lg font-semibold text-text-primary mt-3">
        {block.display_name}
      </h2>

      {/* Rank */}
      <p className="font-mono text-sm text-text-muted">
        Rank {block.rank}
      </p>

      {/* Altitude — large mono number */}
      <div className="mt-2 mb-3">
        <span
          className="font-mono text-3xl font-bold text-text-primary"
          aria-label={`Current altitude: ${block.altitude.toFixed(1)} metres`}
        >
          {block.altitude.toFixed(1)}
        </span>
        <span className="text-lg text-text-muted ml-1">m</span>
      </div>

      {/* Altitude chart — dynamic import */}
      <AltitudeChart
        payments={block.payments}
        categoryAccent={categoryAccent}
        displayName={block.display_name}
      />

      {/* Divider */}
      <div className="border-t border-border-subtle my-4" />

      {/* Burial risk */}
      <BurialRisk
        burialRiskDays={block.burial_risk_days}
        buried={block.buried}
        amberEdge={block.amber_edge}
      />

      {/* Divider */}
      <div className="border-t border-border-subtle my-4" />

      {/* Competitor cost */}
      <CompetitorCost
        competitorCostUsd={block.competitor_cost_usd}
        rank={block.rank}
        category={block.category}
      />
    </article>
  );
}
