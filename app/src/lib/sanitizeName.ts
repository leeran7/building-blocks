/**
 * Sanitise a user-chosen display name before it is stored and shown publicly.
 *
 * The climb leaderboard used to be strictly pseudonymous; a profile display name
 * now overrides that pseudonym on public surfaces. That makes the string an
 * attacker-controlled, public value, so a bare trim + length cap is not enough:
 * invisible and bidi-override characters can spoof adjacent rows and corrupt
 * screen-reader output. We strip those and normalise so what is stored is what a
 * reader actually sees.
 *
 * Pure + deterministic so it is trivially unit-testable. Content moderation
 * (profanity, impersonation, PII) is a separate product concern handled above
 * this layer.
 */

/**
 * True for code points that must never appear in a stored display name:
 * C0/C1 controls, zero-width joiners/spaces, the BOM, and the Unicode
 * bidirectional formatting controls used to visually reorder ("spoof") text.
 * Expressed numerically so the source stays plain ASCII.
 */
function isDisallowed(code: number): boolean {
  return (
    code <= 0x1f || // C0 controls
    (code >= 0x7f && code <= 0x9f) || // DEL + C1 controls
    (code >= 0x200b && code <= 0x200d) || // ZWSP, ZWNJ, ZWJ
    code === 0x2060 || // word joiner
    code === 0xfeff || // ZWNBSP / BOM
    (code >= 0x202a && code <= 0x202e) || // bidi embeddings + overrides
    (code >= 0x2066 && code <= 0x2069) // bidi isolates
  );
}

export function sanitizeDisplayName(raw: string): string {
  const stripped = Array.from(raw.normalize("NFC"))
    .filter((ch) => !isDisallowed(ch.codePointAt(0) as number))
    .join("");
  // Collapse any run of whitespace (incl. odd unicode spaces) to one space.
  return stripped.replace(/\s+/g, " ").trim();
}
