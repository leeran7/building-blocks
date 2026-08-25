"use client";

/**
 * RecordStats — the permanent record card for a block (AC-38).
 *
 * Tower Dark Editorial: accent-themed to the block's category (the parent page
 * sets --accent-rgb), editorial name headline, altitude as the mono centerpiece,
 * restrained stat grid. All logic + data-testids preserved.
 */

interface RecordStatsProps {
  display_name: string;
  url: string;
  slug: string;
  altitude: number;
  peak_rank: number | null;
  views_served: number;
  clicks: number;
  total_spend_cents: number;
  seasons_appeared: number;
  buried: boolean;
  hidden: boolean;
  categoryLabel?: string;
}

export function RecordStats({
  display_name,
  url,
  altitude,
  peak_rank,
  views_served,
  clicks,
  total_spend_cents,
  seasons_appeared,
  buried,
  hidden,
  categoryLabel,
}: RecordStatsProps) {
  const totalSpendUsd = (total_spend_cents / 100).toFixed(2);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div
        className={[
          "bg-surface rounded-2xl border p-6 md:p-8 mb-6 shadow-card",
          buried ? "border-danger/40" : "border-border-subtle",
        ].join(" ")}
      >
        {/* Chips */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {categoryLabel && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent bg-accent/10 border border-accent/30 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
              {categoryLabel}
            </span>
          )}
          {buried && (
            <span className="text-[11px] font-semibold border border-danger/40 text-danger bg-danger/10 rounded-full px-2.5 py-1 uppercase tracking-wider">
              Buried
            </span>
          )}
          {hidden && (
            <span className="text-[11px] font-semibold border border-border-strong text-text-muted rounded-full px-2.5 py-1 uppercase tracking-wider">
              Hidden
            </span>
          )}
        </div>

        {/* Altitude centerpiece */}
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-1">
            Current altitude
          </p>
          <span
            className="font-mono text-5xl md:text-6xl font-bold text-accent tabular-nums leading-none"
            aria-label={`Current altitude: ${altitude.toFixed(1)} metres`}
          >
            {altitude.toFixed(1)}
            <span className="text-2xl text-text-muted font-normal ml-1">m</span>
          </span>
        </div>

        {/* Name + outbound */}
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mt-5">
          {display_name}
        </h1>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-accent hover:brightness-110 text-sm break-all font-mono mt-1"
          aria-label={`Visit ${display_name} (opens external site)`}
          data-testid="record-outbound-link"
        >
          {url} ↗
        </a>

        {/* Stats grid (AC-38) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
          <StatCard label="Peak rank" value={peak_rank ? `#${peak_rank}` : "—"} testId="record-peak-rank" />
          <StatCard label="Altitude" value={`${altitude.toFixed(2)}m`} testId="record-altitude" />
          <StatCard label="Views served" value={views_served.toLocaleString()} testId="record-views-served" />
          <StatCard label="Clicks" value={clicks.toLocaleString()} testId="record-clicks" />
          <StatCard label="Total spend" value={`$${totalSpendUsd}`} testId="record-total-spend" />
          <StatCard label="Seasons" value={String(seasons_appeared)} testId="record-seasons" />
        </div>

        <div className="border-t border-border-subtle pt-4 mt-6">
          <a
            href="/"
            className="text-text-muted hover:text-text-primary text-sm transition-colors"
          >
            ← Back to Tower
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      className="bg-surface-raised border border-border-subtle rounded-xl p-4"
      data-testid={testId}
    >
      <div className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-1.5">
        {label}
      </div>
      <div className="text-lg font-mono font-bold text-text-primary tabular-nums">
        {value}
      </div>
    </div>
  );
}
