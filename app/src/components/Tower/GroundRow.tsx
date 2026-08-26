"use client";

/**
 * GroundRow — the rising-ground boundary (AC-26), ASCENT signature motif.
 *
 * Marks the burial altitude: blocks below are underground. Rendered as the ember
 * "ground creeping up" gradient with a pulsing hazard chip, echoing the landing
 * hero's rising ground. Logic unchanged; role/aria/testids preserved.
 */

interface GroundRowProps {
  ground: number;
  views_k: number;
}

export function GroundRow({ ground, views_k }: GroundRowProps) {
  return (
    <div
      className="relative my-4"
      role="separator"
      aria-label={`Ground level at ${ground.toFixed(2)} metres`}
      data-testid="ground-row"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-ember/80" />
        <span
          className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] text-ember bg-ember/10 border border-ember/35 rounded-full px-3 py-1 flex-shrink-0 whitespace-nowrap shadow-ember"
          aria-label={`Ground level at ${ground.toFixed(2)} metres`}
        >
          <span className="animate-pulse" aria-hidden="true">
            ▲
          </span>
          Ground {ground.toFixed(2)}m
        </span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-ember/80" />
      </div>

      {/* Rising-ground gradient — the hazard creeping up into the buried zone */}
      <div
        className="ground-gradient animate-groundRise h-8 mt-1 rounded-b-sm"
        aria-hidden="true"
      />

      <p className="text-center -mt-4 relative">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted tabular-nums">
          {(views_k * 1000).toLocaleString()} views served · rising
        </span>
      </p>
    </div>
  );
}
