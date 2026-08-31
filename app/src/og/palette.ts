/**
 * ASCENT OG palette — DESIGN.md tokens only.
 * Tests import these hexes; listing/recording generators consume this object.
 */

export const OG_PALETTE = {
  void: "#0a0a0c",
  signal: "#cbf24d",
  ember: "#ff5a2c",
  textPrimary: "#f4f2ec",
} as const;

export type OgPalette = typeof OG_PALETTE;
