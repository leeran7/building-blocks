// Shared helpers: seeded PRNG, module contract validation, small builders.

/** Deterministic PRNG (mulberry32). Same seed -> same sequence. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string -> uint32 seed. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const REQUIRED_EXPORTS = [
  /export\s+const\s+scene\b/,
  /export\s+const\s+camera\b/,
];

// Patterns that violate the fully-procedural / offline-safe contract.
const BANNED = [
  /https?:\/\//,
  /\bfetch\s*\(/,
  /TextureLoader/,
  /GLTFLoader/,
  /FontLoader/,
  /AudioLoader/,
  /VideoTexture/,
  /XMLHttpRequest/,
];

/**
 * Check that generated code honors the module contract.
 * Returns { ok, errors: string[] }.
 */
export function validateContract(code) {
  const errors = [];
  if (typeof code !== "string" || code.length === 0) {
    return { ok: false, errors: ["empty code"] };
  }
  for (const re of REQUIRED_EXPORTS) {
    if (!re.test(code)) errors.push(`missing required export matching ${re}`);
  }
  if (!/from\s+['"]three['"]/.test(code)) {
    errors.push("must import from 'three'");
  }
  for (const re of BANNED) {
    if (re.test(code)) errors.push(`banned pattern: ${re}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Round to 3 decimals for stable, diffable generated code. */
export const r3 = (n) => Math.round(n * 1000) / 1000;
