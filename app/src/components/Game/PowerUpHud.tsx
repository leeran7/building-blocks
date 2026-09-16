"use client";

import { memo, type CSSProperties } from "react";
import { POWER_UP_SPECS, isExpired, powerUpChipMeter } from "../../game/powerups";
import { TICK_HZ, type PlayerState } from "../../game/types";
import { PowerUpTypeIcon } from "./PowerUpTypeIcon";
import "./expedition.css";

/** Passive cartridges; collection and expiry remain owned by the simulation. */
export const ActivePowerStack = memo(function ActivePowerStack({ player, tick }: {
  player: PlayerState | undefined; tick: number;
}) {
  const active = (player?.activePowerUps ?? []).filter(a => !isExpired(a, tick));
  if (!active.length) return null;
  return <div className="exp-powers" aria-label="Active powers">
    {active.map(a => {
      const spec = POWER_UP_SPECS[a.type];
      const meter = powerUpChipMeter(a, tick);
      const seconds = Math.max(0, a.durationTicks - (tick - a.startTick)) / TICK_HZ;
      const fuel = meter.kind === "fuel";
      const label = `${spec.label}, ${seconds.toFixed(1)}s remaining${fuel ? `, ${meter.seconds.toFixed(1)} gal fuel` : ""}`;
      return <div key={a.type} className="exp-cartridge" data-power={a.type} aria-label={label} title={label}
        style={{ "--power-color": spec.color } as CSSProperties}>
        <span className="exp-power-icon" aria-hidden="true"><PowerUpTypeIcon type={a.type} /></span>
        <div className="exp-power-body">
          <div className="exp-power-heading"><span>{spec.label}</span><strong>{seconds.toFixed(1)}<small>s</small></strong></div>
          <div className="exp-power-meter">
            {fuel && <span className="exp-label">FUEL</span>}
            <span className={`exp-track${fuel ? " exp-track-fuel" : ""}`} aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, meter.frac)) * 100}%` }} /></span>
            {fuel && <span className="exp-fuel-value">{meter.seconds.toFixed(1)} <small>GAL</small></span>}
          </div>
        </div>
      </div>;
    })}
  </div>;
});
