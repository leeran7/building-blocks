/**
 * Duel emotes and quick messages.
 *
 * Players can only send entries from this fixed catalog, never free text, so
 * there is nothing to moderate. Over the wire an emote is just its id; the
 * receiver looks it up here and drops anything it does not know.
 */

export type EmoteKind = "emote" | "message";

export interface Emote {
  id: string;
  kind: EmoteKind;
  /** What the bubble shows: an emoji for emotes, the line for messages. */
  text: string;
  /** Accessible name. */
  label: string;
}

export const EMOTES: readonly Emote[] = [
  { id: "fire", kind: "emote", text: "🔥", label: "Fire" },
  { id: "laugh", kind: "emote", text: "😂", label: "Laughing" },
  { id: "shock", kind: "emote", text: "😱", label: "Shocked" },
  { id: "cool", kind: "emote", text: "😎", label: "Cool" },
  { id: "skull", kind: "emote", text: "💀", label: "Skull" },
  { id: "wave", kind: "emote", text: "👋", label: "Wave" },
  { id: "glhf", kind: "message", text: "Good luck!", label: "Good luck!" },
  { id: "gg", kind: "message", text: "GG", label: "GG" },
  { id: "nice", kind: "message", text: "Nice move!", label: "Nice move!" },
  { id: "close", kind: "message", text: "So close!", label: "So close!" },
  { id: "catch", kind: "message", text: "Catch me!", label: "Catch me!" },
  { id: "rematch", kind: "message", text: "Rematch?", label: "Rematch?" },
];

const BY_ID: Readonly<Record<string, Emote>> = Object.freeze(
  Object.fromEntries(EMOTES.map((e) => [e.id, e]))
);

// Own-property check, never `in` and not Object.hasOwn: the mobile SPA ships
// to WebViews that predate it (see lib/avatars.ts).
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The catalog entry for an id off the wire, or null for anything unknown. */
export function emoteById(id: unknown): Emote | null {
  if (typeof id !== "string" || !hasOwn(BY_ID, id)) return null;
  return BY_ID[id];
}

/** Wire payload published on the duel channel under the "emote" name. */
export interface EmoteWireMessage {
  id: string;
}

/** Parse an incoming payload. Rejects, never substitutes. */
export function parseEmoteMessage(data: unknown): Emote | null {
  if (typeof data !== "object" || data === null) return null;
  return emoteById((data as { id?: unknown }).id);
}

/** A sender may emote once per MIN_GAP_MS, and at most BURST times per WINDOW_MS. */
export const EMOTE_MIN_GAP_MS = 1000;
export const EMOTE_BURST = 4;
export const EMOTE_WINDOW_MS = 8000;

/**
 * Rate gate for emotes. The sender uses one to keep a player from flooding
 * the channel; the receiver uses another so a peer that skips the client
 * check still cannot flood the screen.
 */
export function createEmoteGate(
  minGapMs = EMOTE_MIN_GAP_MS,
  burst = EMOTE_BURST,
  windowMs = EMOTE_WINDOW_MS
): { tryTake(now: number): boolean } {
  const recent: number[] = [];
  return {
    tryTake(now: number): boolean {
      while (recent.length > 0 && now - recent[0] >= windowMs) recent.shift();
      const last = recent[recent.length - 1];
      if (last !== undefined && now - last < minGapMs) return false;
      if (recent.length >= burst) return false;
      recent.push(now);
      return true;
    },
  };
}
