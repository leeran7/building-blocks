/**
 * Content moderation for public display names.
 *
 * A profile display name now overrides the pseudonym on the public leaderboard,
 * so it is an attacker-controlled public string. This module rejects racist /
 * hateful names. It is intentionally a defensive filter: false positives cost a
 * user a second attempt at naming, whereas a slur reaching the leaderboard is a
 * real harm — so matching is deliberately aggressive against evasion.
 *
 * Matching strategy: normalise away the usual evasion tricks (case, leet-speak
 * digit/symbol substitutions, spacing and separators) and then test whether any
 * blocked term appears in the collapsed string. Pure + deterministic so the
 * policy is unit-testable without a network call.
 */

// Common leet-speak / homoglyph substitutions folded back to letters so that
// "n1gg3r", "@ss", "$" etc. normalise to their base form before matching.
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
  "+": "t",
};

/**
 * Collapse a name to a comparison key: lowercase, apply leet substitutions,
 * then drop everything that is not a-z. Removing separators defeats
 * "n i g g e r" / "n.i.g.g.e.r" style spacing evasion.
 */
function normalizeForMatch(input: string): string {
  const lowered = input.toLowerCase();
  let out = "";
  for (const ch of lowered) {
    const mapped = LEET[ch] ?? ch;
    if (mapped >= "a" && mapped <= "z") out += mapped;
  }
  return out;
}

// Normalised racial / ethnic slurs and hate terms. Stored normalised (letters
// only, leet already folded) so the list matches the comparison key directly.
// Keep sorted-ish and terse; this is a denylist of hate terms, not a general
// profanity filter.
const BLOCKED_TERMS: string[] = [
  "nigger",
  "nigga",
  "sandnigger",
  "chink",
  "gook",
  "kike",
  "wetback",
  "beaner",
  "raghead",
  "towelhead",
  "jigaboo",
  "porchmonkey",
  "spearchucker",
  "tarbaby",
  "golliwog",
  "zipperhead",
  "slanteye",
  "redskin",
  "injun",
  "gyppo",
  "abbo",
  "coon",
  "spic",
  "heilhitler",
  "siegheil",
  "whitepower",
  "whitepride",
  "kkk",
].map(normalizeForMatch);

/**
 * True if the display name contains a blocked hate term after evasion-resistant
 * normalisation. Empty / whitespace-only names are not "hateful" — they are
 * handled as "no name" elsewhere.
 */
export function isHatefulName(name: string): boolean {
  const key = normalizeForMatch(name);
  if (!key) return false;
  return BLOCKED_TERMS.some((term) => term && key.includes(term));
}
