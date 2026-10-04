/**
 * The floor the player's character last stood on when the level map was on
 * screen, so the map can climb it up the floors cleared since (MapClimber).
 *
 * Device-only and cosmetic: nothing here is sent to the server or trusted by
 * it. A lost or malformed value only means the climb does not play.
 */

/** The floor last shown for a season. */
export interface SeenFloor {
  season: number;
  floor: number;
}

export interface SeenFloorStore {
  /** The floor last shown in `season`, or null (never shown, another season, or unreadable). */
  get(season: number): number | null;
  /** Record the floor now shown in `season`; it replaces any other season's. */
  set(season: number, floor: number): void;
}

export interface SeenFloorStoreOptions {
  /** The signed-in account; each keeps its own floor. */
  accountId?: string | null;
  load?: (key: string) => string | null;
  save?: (key: string, raw: string) => void;
}

const STORAGE_PREFIX = "doomstack:levels:map-floor:v1";
const MAX_SEASON = 999;
const MAX_LEVEL = 9999;

function isCount(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
}

/** A stored value, or null when it is missing or malformed in any way. */
export function parseSeenFloor(raw: string | null): SeenFloor | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isCount(o.season, MAX_SEASON) || !isCount(o.floor, MAX_LEVEL)) return null;
  return { season: o.season, floor: o.floor };
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
    /* private mode or quota: the next visit just doesn't climb */
  }
}

export function createSeenFloorStore(opts: SeenFloorStoreOptions = {}): SeenFloorStore {
  const key = `${STORAGE_PREFIX}:${opts.accountId ?? "anon"}`;
  const load = opts.load ?? localLoad;
  const write = opts.save ?? localSave;
  return {
    get(season) {
      const seen = parseSeenFloor(load(key));
      return seen && seen.season === season ? seen.floor : null;
    },
    set(season, floor) {
      const value: SeenFloor = { season, floor };
      if (parseSeenFloor(JSON.stringify(value)) === null) return;
      write(key, JSON.stringify(value));
    },
  };
}
