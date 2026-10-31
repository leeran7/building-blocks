"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { authedFetch } from "../lib/authedFetch";
import { readSessionCache, writeSessionCache } from "../lib/sessionCache";

export interface DuelStats {
  wins: number;
  losses: number;
  current_streak: number;
}

const DUEL_STATS_KEY = "duel-stats";

/**
 * GET /api/duel/stats answers `null` for a player with no finished 1v1 yet:
 * that is a real 0-0 record, not a missing one. Anything else that isn't the
 * three counts is rejected (null), never read as a record.
 */
export function parseDuelStats(body: unknown): DuelStats | null {
  if (body === null) return { wins: 0, losses: 0, current_streak: 0 };
  if (typeof body !== "object") return null;
  const { wins, losses, current_streak } = body as Record<string, unknown>;
  const count = (n: unknown) => typeof n === "number" && Number.isInteger(n);
  if (!count(wins) || !count(losses) || !count(current_streak)) return null;
  return { wins: wins as number, losses: losses as number, current_streak: current_streak as number };
}

/**
 * The signed-in player's free 1v1 record, shared by /duel and
 * /duel/leaderboard. `undefined` while the first read is in flight (callers
 * hold the record's layout with dashes), `null` when signed out or the read
 * failed. A revisit starts from the last record (sessionCache) and refreshes.
 */
export function useDuelStats(): DuelStats | null | undefined {
  const { user, token } = useAuth();
  const [stats, setStats] = useState<DuelStats | null | undefined>(() =>
    readSessionCache<DuelStats>(user?.uid, DUEL_STATS_KEY)
  );

  useEffect(() => {
    if (!user || !token) return;
    const uid = user.uid;
    let cancelled = false;
    authedFetch("/api/duel/stats", token)
      .then(async (r) => (r.ok ? parseDuelStats(await r.json()) : null))
      .then((next) => {
        if (cancelled) return;
        if (next) writeSessionCache(uid, DUEL_STATS_KEY, next);
        setStats((prev) => next ?? prev ?? null);
      })
      .catch(() => {
        if (!cancelled) setStats((prev) => prev ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  return user && token ? stats : null;
}
