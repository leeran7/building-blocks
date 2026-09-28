import type { TutorialTopic } from "@app/game/levels/tutorial";

/**
 * Which level tutorials this device has already shown, so each plays once
 * (the level screen can still replay them). Stored per device: a lost flag
 * only means a demo plays again.
 */

const KEY = "doomstack:level-tutorials-seen";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : []);
  } catch {
    return new Set();
  }
}

/** The topics from `topics` this device has not shown yet, in order. */
export function unseenTutorials(topics: readonly TutorialTopic[]): TutorialTopic[] {
  const seen = read();
  return topics.filter((t) => !seen.has(t));
}

export function markTutorialsSeen(topics: readonly TutorialTopic[]): void {
  if (topics.length === 0) return;
  const seen = read();
  for (const t of topics) seen.add(t);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: the demo shows again next time */
  }
}
