"use client";

/**
 * RecordStats — Shows peak rank, views, clicks, spend, seasons on record page (AC-38).
 *
 * V2: Dark theme update. All logic preserved exactly.
 * Design spec: design.md §6.20
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
}

export function RecordStats({
  display_name,
  url,
  slug,
  altitude,
  peak_rank,
  views_served,
  clicks,
  total_spend_cents,
  seasons_appeared,
  buried,
  hidden,
}: RecordStatsProps) {
  const totalSpendUsd = (total_spend_cents / 100).toFixed(2);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Main card */}
      <div
        className={[
          "bg-surface rounded-2xl border border-border-subtle p-8 mb-6",
          buried ? "border-l-4 border-l-danger" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            {/* Category badge placeholder — category data available in page */}
            {buried && (
              <span className="text-xs font-semibold border border-danger text-danger rounded-full px-2.5 py-1 uppercase">
                BURIED
              </span>
            )}
            {hidden && (
              <span className="text-xs font-semibold border border-text-disabled text-text-muted rounded-full px-2.5 py-1 uppercase">
                Hidden
              </span>
            )}
          </div>

          {/* Altitude — large mono centerpiece */}
          <div className="mb-4">
            <span
              className="font-mono text-5xl font-bold text-text-primary"
              aria-label={`Current altitude: ${altitude.toFixed(1)} metres`}
            >
              {altitude.toFixed(1)}
            </span>
            <span className="font-mono text-xl text-text-muted ml-2">m</span>
          </div>

          {/* Block name + URL */}
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            {display_name}
          </h1>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-tech hover:underline text-sm break-all font-mono"
            aria-label={`Visit ${display_name} (opens external site)`}
            data-testid="record-outbound-link"
          >
            {url} ↗
          </a>
        </div>

        {/* Stats grid (AC-38) */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Peak rank"
            value={peak_rank ? `#${peak_rank}` : "—"}
            testId="record-peak-rank"
          />
          <StatCard
            label="Altitude"
            value={`${altitude.toFixed(2)}m`}
            testId="record-altitude"
          />
          <StatCard
            label="Views served"
            value={views_served.toLocaleString()}
            testId="record-views-served"
          />
          <StatCard
            label="Clicks"
            value={clicks.toLocaleString()}
            testId="record-clicks"
          />
          <StatCard
            label="Total spend"
            value={`$${totalSpendUsd}`}
            testId="record-total-spend"
          />
          <StatCard
            label="Seasons appeared"
            value={String(seasons_appeared)}
            testId="record-seasons"
          />
        </div>

        {/* Tower link */}
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
      className="bg-elevated border border-border-subtle rounded-xl p-4"
      data-testid={testId}
    >
      <div className="text-xs text-text-muted uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div className="text-lg font-mono font-bold text-text-primary">{value}</div>
    </div>
  );
}
