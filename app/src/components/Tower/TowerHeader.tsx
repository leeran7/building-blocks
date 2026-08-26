"use client";

/**
 * TowerHeader — the tower's live instrument strip (ASCENT).
 *
 * "Cost of #1" is the hero figure (the product's headline number), rendered as a
 * big signal readout. Secondary engine stats sit in a bordered mono grid like a
 * cockpit gauge cluster; Ground reads in ember (the rising hazard).
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
      className="relative bg-surface/70 backdrop-blur border-b border-border-subtle px-4 py-4 edge-signal"
      data-testid="tower-header"
    >
      <div className="max-w-2xl mx-auto flex items-stretch gap-4">
        {/* Hero stat — cost to take #1 */}
        <div
          className="flex flex-col justify-center flex-shrink-0"
          data-testid="header-cost-rank1"
        >
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.16em]">
            Cost of #1
          </span>
          <span className="font-mono text-3xl font-bold text-signal leading-none tabular-nums mt-1">
            ${cost_of_rank1_usd.toFixed(2)}
          </span>
        </div>

        {/* Secondary stats — cockpit gauge cluster */}
        <dl className="flex flex-1 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle">
          {[
            {
              t: "Views served",
              v: viewsServedDisplay,
              cls: "text-text-primary",
              id: "header-views-served",
            },
            {
              t: "$1 buys",
              v: `${rate.toFixed(2)}m`,
              cls: "text-text-primary",
              id: "header-rate",
            },
            {
              t: "Ground",
              v: `${ground.toFixed(2)}m`,
              cls: "text-ember",
              id: "header-ground",
            },
          ].map((s) => (
            <div
              key={s.id}
              className="flex flex-1 flex-col justify-center bg-surface px-3 py-2"
              data-testid={s.id}
            >
              <dt className="font-mono text-[10px] text-text-muted uppercase tracking-[0.14em]">
                {s.t}
              </dt>
              <dd className={`font-mono text-sm font-bold tabular-nums mt-0.5 ${s.cls}`}>
                {s.v}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Growth indicator */}
      {growth >= 8 && (
        <div className="max-w-2xl mx-auto mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-warning">
          ▲ rate at cap (×{growth.toFixed(1)}) — season nearly full
        </div>
      )}
    </header>
  );
}
