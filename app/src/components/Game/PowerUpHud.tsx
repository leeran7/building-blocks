"use client";

import { memo, type CSSProperties } from "react";
import { POWER_UP_SPECS, isExpired, powerUpChipMeter } from "../../game/powerups";
import { TICK_HZ, type PlayerState } from "../../game/types";
import { PowerUpTypeIcon } from "./PowerUpTypeIcon";
import "./expedition.css";

/** Below this share of the tank the Jetpack chip turns red and blinks. */
export const LOW_FUEL_FRAC = 0.2;

/**
 * Passive round chips; collection and expiry remain owned by the simulation.
 * The ring drains with the power's time. The Jetpack also fills its core with
 * the fuel left, since the pack can run dry before its window closes.
 */
export const ActivePowerStack = memo(function ActivePowerStack({ player, tick }: {
  player: PlayerState | undefined; tick: number;
}) {
  const active = (player?.activePowerUps ?? []).filter(a => !isExpired(a, tick));
  if (!active.length) return null;
  return <div className="exp-powers" aria-label="Active powers">
    {active.map(a => {
      const spec = POWER_UP_SPECS[a.type];
      const meter = powerUpChipMeter(a, tick);
      const remaining = Math.max(0, a.durationTicks - (tick - a.startTick));
      const seconds = remaining / TICK_HZ;
      const timeFrac = a.durationTicks > 0 ? Math.min(1, remaining / a.durationTicks) : 0;
      const fuel = meter.kind === "fuel";
      const fuelFrac = Math.max(0, Math.min(1, meter.frac));
      const label = `${spec.label}, ${seconds.toFixed(1)}s remaining${fuel ? `, ${meter.seconds.toFixed(1)} gal fuel` : ""}`;
      return <div key={a.type} className="exp-chip" data-power={a.type} aria-label={label} title={label}
        data-low-fuel={fuel && fuelFrac < LOW_FUEL_FRAC ? "" : undefined}
        style={{ "--power-color": spec.color, "--t": timeFrac.toFixed(3) } as CSSProperties}>
        <span className="exp-chip-ring" aria-hidden="true">
          <span className="exp-chip-core">
            {fuel && <i className="exp-chip-fuel" data-fuel-frac={fuelFrac.toFixed(3)} style={{ height: `${fuelFrac * 100}%` }} />}
            <PowerUpTypeIcon type={a.type} />
          </span>
        </span>
        <span className="sr-only">{spec.label}</span>
        <strong>{seconds.toFixed(1)}<small>s</small></strong>
        {fuel && <span className="exp-fuel-value">{meter.seconds.toFixed(1)} <small>GAL</small></span>}
      </div>;
    })}
  </div>;
});
