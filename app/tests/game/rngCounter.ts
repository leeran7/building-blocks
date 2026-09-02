/**
 * Counts seeded RNG constructions, so tests can assert the algorithmic cost of
 * tower geometry deterministically instead of timing it.
 *
 * Lives in its own module because a vi.mock factory is hoisted above the file's
 * imports and cannot close over values declared beside it.
 */

export function recordRngSeed(seed: string): void {
  total += 1;
  // Floor-gap draws are seeded "<tower.seed>:fg:<floor>"; ladders and power-ups
  // use their own prefixes and would otherwise drown out the signal.
  if (seed.includes(":fg:")) gapDraws += 1;
}

export function gapRngCount(): number {
  return gapDraws;
}

export function totalRngCount(): number {
  return total;
}

export function resetRngCounts(): void {
  gapDraws = 0;
  total = 0;
}

let gapDraws = 0;
let total = 0;
