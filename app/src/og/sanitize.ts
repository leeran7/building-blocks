/**
 * Attacker-controlled OG display text: strip markup, strip bidi/controls,
 * cap length, never throw.
 */

import { sanitizeDisplayName } from "../lib/sanitizeName";

export function sanitizeOgText(raw: string, maxLen: number): string {
  try {
    const source = typeof raw === "string" ? raw : "";
    const noTags = source.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
    const cleaned = sanitizeDisplayName(noTags);
    const cap = Number.isFinite(maxLen) && maxLen > 0 ? maxLen : 0;
    if (cleaned.length <= cap) return cleaned;
    return cleaned.slice(0, cap);
  } catch {
    return "";
  }
}
