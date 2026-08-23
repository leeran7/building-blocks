"use client";

/**
 * TowerHeader — Shows cost of #1, views served, $1 buys Nm (AC-27). V2 theme.
 *
 * Logic unchanged from v1. Tailwind classes updated to v2 design tokens.
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
      className="bg-surface/80 backdrop-blur border-b border-border-subtle px-4 py-3"
      data-testid="tower-header"
    >
      <div className="max-w-2xl mx-auto">
        {/* Stats row — AC-27: all three values shown and updated on poll */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex flex-col" data-testid="header-cost-rank1">
            <span className="text-text-muted text-xs uppercase tracking-wider">
              Cost of #1
            </span>
            <span className="font-mono font-bold text-text-primary">
              ${cost_of_rank1_usd.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col" data-testid="header-views-served">
            <span className="text-text-muted text-xs uppercase tracking-wider">
              Views served
            </span>
            <span className="font-mono font-bold text-text-primary">
              {viewsServedDisplay}
            </span>
          </div>

          <div className="flex flex-col" data-testid="header-rate">
            <span className="text-text-muted text-xs uppercase tracking-wider">
              $1 buys
            </span>
            <span className="font-mono font-bold text-accent-tech">
              {rate.toFixed(2)}m
            </span>
          </div>

          <div className="flex flex-col" data-testid="header-ground">
            <span className="text-text-muted text-xs uppercase tracking-wider">
              Ground
            </span>
            <span className="font-mono font-bold text-danger">
              {ground.toFixed(2)}m
            </span>
          </div>
        </div>

        {/* Growth indicator */}
        {growth >= 8 && (
          <div className="mt-2 text-xs text-text-muted">
            Rate at cap (×{growth.toFixed(1)}) — season nearly full
          </div>
        )}
      </div>
    </header>
  );
}
