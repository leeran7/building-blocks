"use client";

/**
 * GroundRow — the rising-ground boundary (AC-26).
 *
 * Marks the burial altitude: blocks below this line are underground. Styled as
 * a solid danger line with a label chip and a fade into the buried zone.
 * Logic unchanged; role/aria/testids preserved.
 */

interface GroundRowProps {
  ground: number;
  views_k: number;
}

export function GroundRow({ ground, views_k }: GroundRowProps) {
  return (
    <div
      className="relative my-3"
      role="separator"
      aria-label={`Ground level at ${ground.toFixed(2)} metres`}
      data-testid="ground-row"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-danger/70 to-danger/70" />
        <span
          className="flex items-center gap-1.5 font-mono text-xs font-semibold text-danger bg-danger/10 border border-danger/30 rounded-full px-3 py-1 flex-shrink-0 whitespace-nowrap"
          aria-label={`Ground level at ${ground.toFixed(2)} metres`}
        >
          <span aria-hidden="true">▲</span>
          Ground {ground.toFixed(2)}m
        </span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-danger/70 to-danger/70" />
      </div>

      {/* Buried-zone fade */}
      <div
        className="h-5"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,84,112,0.10) 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      <p className="text-center -mt-3">
        <span className="text-[11px] text-text-muted font-mono tabular-nums">
          {(views_k * 1000).toLocaleString()} views served · rising
        </span>
      </p>
    </div>
  );
}
