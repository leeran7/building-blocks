/**
 * Eyebrow label for the climb lobby overlay: rendered as `[ <label> ]`.
 *
 * Callers pass a category label that MAY or MAY NOT already contain the word
 * "climb" (e.g. "Free climb" does; "Daily", "Tech", "Design" do not). The lobby
 * eyebrow historically read "<label> climb", so a label that already carries the
 * word doubled it — "Free climb" became "[ FREE CLIMB CLIMB ]". Append " climb"
 * only when the label does not already contain the word (case-insensitive,
 * whole-word), so every category reads correctly:
 *   "Free climb" -> "Free climb"        (already present)
 *   "Daily"      -> "Daily climb"
 *   "Tech"       -> "Tech climb"
 */
export function climbEyebrowLabel(categoryLabel: string): string {
  const label = categoryLabel.trim();
  return /\bclimb\b/i.test(label) ? label : `${label} climb`;
}
