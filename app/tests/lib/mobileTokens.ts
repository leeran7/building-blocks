/**
 * Test helper: resolve the mobile SPA's Tailwind colour utilities to the hex
 * values declared in its @theme (mobile/src/styles.css, the source of truth)
 * and compute WCAG contrast. happy-dom does no layout or CSS, so a rendered
 * element's colour classes are resolved here instead.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STYLES = resolve(__dirname, "../../mobile/src/styles.css");

/** `--color-<name>: #rrggbb;` from the @theme block. */
export function mobileColorTokens(): Map<string, string> {
  const css = readFileSync(STYLES, "utf8");
  const theme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const tokens = new Map<string, string>();
  for (const m of theme.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    tokens.set(m[1], m[2].toLowerCase());
  }
  return tokens;
}

/**
 * The opaque hex a `bg-<token>` / `text-<token>` class paints, or null when the
 * class is not a colour token or carries an alpha (`bg-signal/[0.09]`,
 * `text-white/50`): a translucent colour has no single contrast value.
 */
export function opaqueTokenColor(cls: string, prefix: "bg" | "text", tokens: Map<string, string>): string | null {
  if (!cls.startsWith(`${prefix}-`) || cls.includes("/")) return null;
  return tokens.get(cls.slice(prefix.length + 1)) ?? null;
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio between two opaque hex colours. */
export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
