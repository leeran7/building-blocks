"use client";

/**
 * TowerHeader — Shows cost of #1, views served, $1 buys Nm (AC-27).
 * Updates on every poll cycle.
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
      className="bg-tower-surface/80 backdrop-blur border-b border-tower-border px-4 py-3"
      data-testid="tower-header"
    >
      <div className="max-w-2xl mx-auto">
        {/* Tower wordmark */}
        <h1 className="text-2xl font-black tracking-widest text-tower-sky uppercase mb-3">
          TOWER
        </h1>

        {/* Stats row — AC-27: all three values shown and updated on poll */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex flex-col" data-testid="header-cost-rank1">
            <span className="text-tower-muted text-xs uppercase tracking-wider">
              Cost of #1
            </span>
            <span className="font-bold text-tower-text">
              ${cost_of_rank1_usd.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col" data-testid="header-views-served">
            <span className="text-tower-muted text-xs uppercase tracking-wider">
              Views served
            </span>
            <span className="font-bold text-tower-text">{viewsServedDisplay}</span>
          </div>

          <div className="flex flex-col" data-testid="header-rate">
            <span className="text-tower-muted text-xs uppercase tracking-wider">
              $1 buys
            </span>
            <span className="font-bold text-tower-sky">
              {rate.toFixed(2)}m
            </span>
          </div>

          <div className="flex flex-col" data-testid="header-ground">
            <span className="text-tower-muted text-xs uppercase tracking-wider">
              Ground
            </span>
            <span className="font-bold text-amber-500">
              {ground.toFixed(2)}m
            </span>
          </div>
        </div>

        {/* Growth indicator */}
        {growth >= 8 && (
          <div className="mt-2 text-xs text-tower-muted">
            Rate at cap (×{growth.toFixed(1)}) — season nearly full
          </div>
        )}
      </div>
    </header>
  );
}
