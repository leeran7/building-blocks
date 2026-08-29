/**
 * Tower v3 "The Climb" — deterministic seeded RNG.
 *
 * The netcode is authoritative + prediction with re-simulation-based anti-cheat
 * (spec-next.md, Netcode + AC-11, AC-17). That REQUIRES determinism: given the
 * same seed and input log, server and client must produce bit-identical state.
 * `Math.random()` is therefore banned in the simulation — all randomness (falling
 * hazards, power-up spawns) comes from this seeded generator.
 *
 * Implementation: mulberry32 — a small, fast, well-distributed 32-bit PRNG that
 * is fully deterministic and portable across V8 (server + browser), so it does
 * not introduce the platform-divergence risk R-1 warns about.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** Current internal state (for snapshotting / re-seeding). */
  state(): number;
}

/** Hash an arbitrary string seed to a 32-bit unsigned integer (xmur3-ish). */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Create a deterministic RNG from a numeric or string seed. */
export function createRng(seed: number | string): Rng {
  let a = (typeof seed === "string" ? hashSeed(seed) : seed >>> 0) || 1;

  function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int(minInclusive: number, maxExclusive: number): number {
      if (maxExclusive <= minInclusive) return minInclusive;
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    state(): number {
      return a >>> 0;
    },
  };
}

/** Opaque hex id for one climb — generated outside the sim, then used as a seed. */
export function newRunSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
