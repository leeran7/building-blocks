import { floorIndexAt, summitFloor } from "@app/game/towers";
import type { TowerSpec } from "@app/game/types";

/**
 * Near-miss retries (design §6.2), on the device only: nothing here is sent
 * to the server or trusted by it.
 *
 * A lost run that ended close to the summit leads the fail screen with how
 * close it was ("2 floors from the summit!"), and the best failed height on
 * each level is kept on the device so the next try can show it as a marker
 * on the goal bar while it is within reach.
 */

/** Share of the goal height that still counts as close. */
export const NEAR_MISS_FRACTION = 0.1;

/** Floors between the floor a run peaked on and the summit floor (0 once it reached the goal). */
export function floorsShort(tower: TowerSpec, peakFt: number, goalFt: number): number {
  if (!(goalFt > 0) || !Number.isFinite(peakFt) || peakFt >= goalFt) return 0;
  const summit = summitFloor({ ...tower, goalM: goalFt });
  if (summit === null) return 0;
  return Math.max(0, summit - floorIndexAt(tower, Math.max(0, peakFt)));
}

/**
 * Whether a run that peaked at `peakFt` came within max(1 floor, 10% of the
 * goal) of the summit without reaching it.
 */
export function isNearMiss(tower: TowerSpec, peakFt: number, goalFt: number): boolean {
  if (!(goalFt > 0) || !Number.isFinite(peakFt) || peakFt >= goalFt) return false;
  return floorsShort(tower, peakFt, goalFt) <= 1 || goalFt - peakFt <= NEAR_MISS_FRACTION * goalFt;
}

/** How a lost run's distance to the summit is worded when it was close. */
export function nearMissHeadline(tower: TowerSpec, peakFt: number, goalFt: number): string | null {
  if (!isNearMiss(tower, peakFt, goalFt)) return null;
  const floors = floorsShort(tower, peakFt, goalFt);
  if (floors <= 1) return "1 floor from the summit!";
  return `${floors} floors from the summit!`;
}

// ── Best failed height, per season and level ─────────────────────────────────

const STORAGE_PREFIX = "doomstack:levels:best-fail:v2";

/**
 * Each season has its own towers (past seasons stay playable), so marks are
 * kept per season: level 12 of season 2 must never show season 1's mark.
 */
function entryKey(season: number, level: number): string {
  return `${season}:${level}`;
}

/** Stored best failed heights by "season:level", or {} when missing or malformed. */
export function parseBestFails(raw: string | null): Record<string, number> {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [key, ft] of Object.entries(v as Record<string, unknown>)) {
    if (/^[1-9]\d{0,2}:[1-9]\d{0,3}$/.test(key) && typeof ft === "number" && Number.isFinite(ft) && ft > 0) out[key] = ft;
  }
  return out;
}

export interface BestFailStore {
  /** Best failed height on `level` of `season`, ft, or null. */
  get(season: number, level: number): number | null;
  /** Keep `peakFt` when it beats the stored best. */
  record(season: number, level: number, peakFt: number): void;
  /** Forget the level (it was cleared). */
  clear(season: number, level: number): void;
}

export interface BestFailStoreOptions {
  /** The signed-in account; each keeps its own marks. */
  accountId?: string | null;
  load?: (key: string) => string | null;
  save?: (key: string, raw: string) => void;
}

function localLoad(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSave(key: string, raw: string): void {
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* private mode or quota: the marker lasts this session only */
  }
}

export function createBestFailStore(opts: BestFailStoreOptions = {}): BestFailStore {
  const key = `${STORAGE_PREFIX}:${opts.accountId ?? "anon"}`;
  const load = opts.load ?? localLoad;
  const save = opts.save ?? localSave;
  let memory: Record<string, number> | null = null;
  const read = () => (memory ??= parseBestFails(load(key)));
  const write = (next: Record<string, number>) => {
    memory = next;
    save(key, JSON.stringify(next));
  };
  return {
    get(season, level) {
      const all = read();
      const k = entryKey(season, level);
      return Object.prototype.hasOwnProperty.call(all, k) ? (all[k] ?? null) : null;
    },
    record(season, level, peakFt) {
      if (!Number.isInteger(season) || season < 1 || !Number.isInteger(level) || level < 1) return;
      if (!Number.isFinite(peakFt) || peakFt <= 0) return;
      const all = read();
      const k = entryKey(season, level);
      const prev = Object.prototype.hasOwnProperty.call(all, k) ? all[k] : undefined;
      if (prev !== undefined && prev >= peakFt) return;
      write({ ...all, [k]: peakFt });
    },
    clear(season, level) {
      const all = read();
      const k = entryKey(season, level);
      if (!Object.prototype.hasOwnProperty.call(all, k)) return;
      const next = { ...all };
      delete next[k];
      write(next);
    },
  };
}

/**
 * The marker to show on the next try: the best failed height when it is
 * within max(1 floor, 10%) of the goal, else null.
 */
export function bestFailMarker(tower: TowerSpec, bestFt: number | null, goalFt: number): number | null {
  if (bestFt === null) return null;
  return isNearMiss(tower, bestFt, goalFt) ? bestFt : null;
}
