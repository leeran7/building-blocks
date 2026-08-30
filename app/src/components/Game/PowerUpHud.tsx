"use client";

/**
 * Power-up status strip: what is running, how long is left, and a sound toggle.
 *
 * The canvas already shows an aura per live effect; this adds the precise
 * remaining time, which a pulsing ring cannot convey, and gives the whole
 * feature real text for screen readers and for anyone who finds the type
 * icons alone ambiguous.
 *
 * Layout is deliberately rigid: the strip sits ABOVE the canvas, whose height
 * budget is measured from its own top edge downward, so any growth here moves
 * the canvas. It keeps a fixed height and scrolls sideways rather than wrapping,
 * so chips appearing and expiring mid-climb can never resize the play area.
 */

import {
  POWER_UP_SPECS,
  isExpired,
  powerUpChipMeter,
  type PowerUpChipMeter,
  type PowerUpSpec,
} from "../../game/powerups";
import { TICK_HZ, type ActivePowerUp, type PlayerState } from "../../game/types";
import { PowerUpTypeIcon } from "./PowerUpTypeIcon";

export function PowerUpHud({
  player,
  tick,
  muted,
  onToggleMute,
  announcement,
  runId,
}: {
  player: PlayerState | undefined;
  tick: number;
  muted: boolean;
  onToggleMute: () => void;
  announcement: string;
  /** Remounts the live region so a new run does not speak the previous run. */
  runId: number;
}) {
  const active = (player?.activePowerUps ?? [])
    .filter((a) => !isExpired(a, tick))
    .map((a) => {
      const spec = POWER_UP_SPECS[a.type];
      const meter = powerUpChipMeter(a, tick);
      const windowSeconds = windowSecondsLeft(a, tick);
      const ageTicks = tick - a.startTick;
      return {
        type: a.type,
        spec,
        meter,
        fresh: ageTicks >= 0 && ageTicks < 18,
        urgent: meter.frac <= 0.15 || windowSeconds <= 1,
        label: chipAriaLabel(spec, meter, windowSeconds),
      };
    });

  return (
    <div className="flex w-full h-[46px] items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
        {active.map((a) => (
          <span
            key={a.type}
            className={chipClassName(a.fresh, a.urgent)}
            style={{
              borderColor: a.spec.color,
              color: a.spec.color,
              // Depleting fill doubles as the countdown; the numeral next to it
              // keeps it readable when the bar is nearly empty.
              background: `linear-gradient(to right, ${a.spec.color}26 ${
                a.meter.frac * 100
              }%, transparent ${a.meter.frac * 100}%)`,
              boxShadow: a.fresh
                ? `0 0 0 1px ${a.spec.color}55, 0 0 18px -4px ${a.spec.color}66`
                : a.urgent
                  ? `0 0 0 1px ${a.spec.color}44, 0 0 12px -6px ${a.spec.color}55`
                  : undefined,
            }}
            aria-label={a.label}
            title={a.label}
          >
            <span
              aria-hidden="true"
              className="inline-flex h-[14px] w-[14px] flex-shrink-0"
            >
              <PowerUpTypeIcon type={a.type} />
            </span>
            {a.spec.label}
            <span className="tabular-nums">{a.meter.seconds.toFixed(1)}s</span>
          </span>
        ))}

        {active.length === 0 && (
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
            climbing — grab a glowing orb
          </span>
        )}
      </div>

      <button
        type="button"
        data-game-control
        onClick={onToggleMute}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={muted}
        className="flex-shrink-0 min-h-[44px] min-w-[44px] rounded-full border border-border-strong bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary hover:text-text-primary hover:border-signal/50 transition-colors"
      >
        <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
        <span className="sr-only">
          {muted ? "Unmute game sound" : "Mute game sound"}
        </span>
      </button>

      <div
        key={runId}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </div>
  );
}

function chipClassName(fresh: boolean, urgent: boolean): string {
  const base =
    "relative inline-flex flex-shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-[box-shadow,transform] duration-200";
  if (fresh) return `${base} animate-powerUpEnter motion-reduce:animate-none`;
  if (urgent) return `${base} animate-powerUpUrgent motion-reduce:animate-none`;
  return base;
}

function windowSecondsLeft(a: ActivePowerUp, tick: number): number {
  return Math.max(0, a.durationTicks - (tick - a.startTick)) / TICK_HZ;
}

function chipAriaLabel(
  spec: PowerUpSpec,
  meter: PowerUpChipMeter,
  windowSeconds: number
): string {
  if (meter.kind === "fuel") {
    return `${spec.label}, ${meter.seconds.toFixed(1)}s fuel, ${windowSeconds.toFixed(1)}s remaining`;
  }
  return `${spec.label}, ${meter.seconds.toFixed(1)}s remaining`;
}
