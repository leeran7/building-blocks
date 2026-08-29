/**
 * Bounded per-seed memo for derived tower geometry.
 *
 * Two caches in this directory are keyed by a tower seed. That was safe while
 * seeds were stable per category — a fixed handful of keys — but seeds now mix
 * in a fresh newRunSeed() per run, so an unbounded Map grows by one
 * permanently-retained entry per game played, and the values grow with
 * altitude. A run only ever needs the tower it is climbing, so a small LRU is
 * enough.
 *
 * Insertion order is the LRU order: Map preserves it, a hit re-inserts to move
 * the key to the newest position, and eviction takes the first key.
 */

export function createSeedCache<T>(limit: number, build: () => T): SeedCache<T> {
  const entries = new Map<string, T>();

  return {
    get(seed: string): T {
      const hit = entries.get(seed);
      if (hit !== undefined) {
        entries.delete(seed);
        entries.set(seed, hit);
        return hit;
      }

      const fresh = build();
      entries.set(seed, fresh);
      if (entries.size > limit) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      return fresh;
    },

    get size(): number {
      return entries.size;
    },

    clear(): void {
      entries.clear();
    },
  };
}

export interface SeedCache<T> {
  /** The entry for `seed`, creating it if absent and evicting the oldest. */
  get(seed: string): T;
  /** Number of retained entries. Never exceeds the configured limit. */
  readonly size: number;
  clear(): void;
}
