import { useEffect, useState } from "react";
import { msUntilUtcReset, utcDayKey } from "@app/lib/dailyDay";

/** Countdown refresh cadence; the displayed countdown has minute resolution. */
const TICK_MS = 30_000;
/** Fire just after the reset so utcDayKey has already rolled over. */
const ROLLOVER_SLACK_MS = 250;

export interface UtcDayClock {
  /** The device's current UTC day key. */
  day: string;
  /** Milliseconds until the next 00:00 UTC reset. */
  msUntilReset: number;
}

function read(): UtcDayClock {
  const now = Date.now();
  return { day: utcDayKey(now), msUntilReset: msUntilUtcReset(now) };
}

/**
 * The Daily Climb clock for screens that stay mounted: re-reads every 30 s,
 * exactly at the UTC reset, and on return to the foreground (timers do not
 * run while the app is suspended). Consumers key day-scoped data on `day`,
 * so a rollover refetches today's board instead of showing yesterday's.
 */
export function useUtcDay(): UtcDayClock {
  const [clock, setClock] = useState<UtcDayClock>(read);

  useEffect(() => {
    const refresh = () => setClock(read());
    const interval = window.setInterval(refresh, TICK_MS);
    const rollover = window.setTimeout(refresh, clock.msUntilReset + ROLLOVER_SLACK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(rollover);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Re-arm the rollover timer once per day, not on every countdown tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.day]);

  return clock;
}
