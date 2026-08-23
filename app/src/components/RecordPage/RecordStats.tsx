"use client";

/**
 * RecordStats — Shows peak rank, views, clicks, spend, seasons on record page (AC-38).
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
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-tower-text">{display_name}</h1>
          {buried && (
            <span className="text-xs bg-tower-buried/20 text-tower-buried px-2 py-0.5 rounded">
              Buried
            </span>
          )}
          {hidden && (
            <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded">
              Hidden
            </span>
          )}
        </div>

        {/* Live outbound link (AC-39) */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-tower-sky hover:underline text-sm break-all"
          aria-label={`Visit ${display_name} (opens external site)`}
          data-testid="record-outbound-link"
        >
          {url}
        </a>
      </div>

      {/* Stats grid (AC-38) */}
      <div className="grid grid-cols-2 gap-4 mb-8">
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
      <div className="border-t border-tower-border pt-4">
        <a
          href="/"
          className="text-tower-muted hover:text-tower-sky text-sm"
        >
          ← Back to Tower
        </a>
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
      className="bg-tower-surface border border-tower-border rounded p-3"
      data-testid={testId}
    >
      <div className="text-xs text-tower-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-lg font-bold text-tower-text">{value}</div>
    </div>
  );
}
