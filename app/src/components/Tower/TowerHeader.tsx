"use client";

/**
 * TowerHeader — the tower's live stat bar.
 *
 * "Cost of #1" is the hero figure (the product's headline number) and is
 * accent-themed to the active tower. Secondary engine stats sit beside it.
 * Logic unchanged from v1; all data-testids preserved (AC-27).
 */

interface TowerHeaderProps {
  cost_of_rank1_usd: number;
  views_k: number;
  rate: number;
  growth: number;
  ground: number;
}

export function TowerHeader({
  cost_of_rank1_usd,
  views_k,
  rate,
  growth,
  ground,
}: TowerHeaderProps) {
  const viewsServedDisplay = (views_k * 1000).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

  return (
    <header
      className="bg-surface/70 backdrop-blur border-b border-border-subtle px-4 py-3"
      data-testid="tower-header"
    >
      <div className="max-w-2xl mx-auto flex items-center gap-5">
        {/* Hero stat — cost to take #1 */}
        <div className="flex flex-col" data-testid="header-cost-rank1">
          <span className="text-[10px] text-text-muted uppercase tracking-[0.15em]">
            Cost of #1
          </span>
          <span className="font-mono text-2xl font-bold text-accent leading-tight tabular-nums">
            ${cost_of_rank1_usd.toFixed(2)}
          </span>
        </div>

        <div className="w-px self-stretch bg-border-subtle" aria-hidden="true" />

        {/* Secondary stats */}
        <dl className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div className="flex flex-col" data-testid="header-views-served">
            <dt className="text-[10px] text-text-muted uppercase tracking-[0.15em]">
              Views served
            </dt>
            <dd className="font-mono font-semibold text-text-primary tabular-nums">
              {viewsServedDisplay}
            </dd>
          </div>

          <div className="flex flex-col" data-testid="header-rate">
            <dt className="text-[10px] text-text-muted uppercase tracking-[0.15em]">
              $1 buys
            </dt>
            <dd className="font-mono font-semibold text-text-primary tabular-nums">
              {rate.toFixed(2)}m
            </dd>
          </div>

          <div className="flex flex-col" data-testid="header-ground">
            <dt className="text-[10px] text-text-muted uppercase tracking-[0.15em]">
              Ground
            </dt>
            <dd className="font-mono font-semibold text-danger tabular-nums">
              {ground.toFixed(2)}m
            </dd>
          </div>
        </dl>
      </div>

      {/* Growth indicator */}
      {growth >= 8 && (
        <div className="max-w-2xl mx-auto mt-2 text-[11px] text-warning">
          Rate at cap (×{growth.toFixed(1)}) — season nearly full
        </div>
      )}
    </header>
  );
}
