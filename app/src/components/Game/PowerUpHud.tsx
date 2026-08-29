"use client";

/**
 * Power-up status strip: what is running, how long is left, and a sound toggle.
 *
 * The canvas already shows an aura per live effect; this adds the precise
 * remaining time, which a pulsing ring cannot convey, and gives the whole
 * feature real text for screen readers and for anyone who finds the glyphs
 * alone ambiguous.
 *
 * Overlayed on the canvas (not laid out above it) so it never steals height
 * from the play surface. Fixed height, chips scroll sideways rather than wrap,
 * so chips appearing and expiring mid-climb cannot resize the play area.
 */

import type { ReactNode } from "react";
import { POWER_UP_SPECS, isExpired } from "../../game/powerups";
import { TICK_HZ, type PlayerState } from "../../game/types";

export function PowerUpHud({
  player,
  tick,
  hazardY,
  muted,
  onToggleMute,
  announcement,
  leading,
}: {
  player: PlayerState | undefined;
  tick: number;
  hazardY: number;
  muted: boolean;
  onToggleMute: () => void;
  announcement: string;
  leading?: ReactNode;
}) {
  const playerY = player?.y ?? 0;
  const active = (player?.activePowerUps ?? [])
    .filter((a) => !isExpired(a, tick))
    .map((a) => {
      const remaining = Math.max(0, a.durationTicks - (tick - a.startTick));
      return {
        type: a.type,
        spec: POWER_UP_SPECS[a.type],
        seconds: remaining / TICK_HZ,
        frac: a.durationTicks > 0 ? remaining / a.durationTicks : 0,
      };
    });

  return (
    <div className="flex w-full h-[46px] items-center gap-2 px-2">
      {leading ? <div className="flex-shrink-0">{leading}</div> : null}

      <p className="flex-shrink-0 font-mono text-xs font-bold text-text-primary tabular-nums">
        {playerY.toFixed(1)}m
      </p>
      <p className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
        lava {hazardY.toFixed(1)}m
      </p>

      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
        {active.map((a) => (
          <span
            key={a.type}
            className="relative inline-flex flex-shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{
              borderColor: a.spec.color,
              color: a.spec.color,
              // Depleting fill doubles as the countdown; the numeral next to it
              // keeps it readable when the bar is nearly empty.
              background: `linear-gradient(to right, ${a.spec.color}26 ${
                a.frac * 100
              }%, transparent ${a.frac * 100}%)`,
            }}
          >
            <span aria-hidden="true">{a.spec.glyph}</span>
            {a.spec.label}
            <span className="tabular-nums">{a.seconds.toFixed(1)}s</span>
          </span>
        ))}

        {active.length === 0 && (
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            climbing — grab a glowing orb
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        aria-pressed={muted}
        className="flex-shrink-0 rounded-full border border-border-strong bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary hover:text-text-primary hover:border-signal/50 transition-colors"
      >
        <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
        <span className="sr-only">
          {muted ? "Unmute power-up sounds" : "Mute power-up sounds"}
        </span>
      </button>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
