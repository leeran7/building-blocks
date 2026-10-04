/**
 * Duel emotes and quick messages.
 *
 * Players can only send entries from this fixed catalog, never free text, so
 * there is nothing to moderate. Over the wire an emote is just its id; the
 * receiver looks it up here and drops anything it does not know.
 *
 * The set follows what the long-running duel games settled on:
 *   - a small wheel of reactions a player learns by heart (Clash Royale ships
 *     four king emotes, Brawl Stars a pin set of five), each one a character
 *     or prop that animates for a couple of seconds with a sound;
 *   - quick messages grouped by when they are said (Rocket League's
 *     compliments / reactions / post-game), so the right line is one tap away;
 *   - a cooldown and a mute, because an emote the other player cannot escape
 *     stops being fun.
 *
 * Every emote here is a 3D prop (components/Duel/emotes3d) rendered live;
 * `glyph` is only the fallback for a device without WebGL and the text for
 * screen readers. Quick messages carry the prop that rides beside them.
 */

export type EmoteKind = "emote" | "message";

/** The 3D props. Each has a model in components/Duel/emotes3d/emoteModels.ts. */
export type EmoteProp =
  | "crown"
  | "skull"
  | "rocket"
  | "flame"
  | "thumbs"
  | "heart"
  | "bolt"
  | "hourglass"
  | "swords";

/** When in a duel a quick message is most likely said; the tray lists that group first. */
export type DuelMoment = "lobby" | "climb" | "result";

export interface Emote {
  id: string;
  kind: EmoteKind;
  /** The 3D prop shown: the emote itself, or the icon beside a quick message. */
  prop: EmoteProp;
  /** Quick messages: the line. Emotes: empty. */
  text: string;
  /** Accessible name, and the bubble's caption for an emote. */
  label: string;
  /** Fallback glyph when WebGL is unavailable. */
  glyph: string;
  /** Quick messages only: the moment this line belongs to. */
  moment?: DuelMoment;
}

export const EMOTES: readonly Emote[] = [
  // ── Props ────────────────────────────────────────────────────────────────
  { id: "crown", kind: "emote", prop: "crown", text: "", label: "On top", glyph: "👑" },
  { id: "skull", kind: "emote", prop: "skull", text: "", label: "Toast", glyph: "💀" },
  { id: "rocket", kind: "emote", prop: "rocket", text: "", label: "Lift off", glyph: "🚀" },
  { id: "flame", kind: "emote", prop: "flame", text: "", label: "On fire", glyph: "🔥" },
  { id: "thumbs", kind: "emote", prop: "thumbs", text: "", label: "Nice", glyph: "👍" },
  { id: "heart", kind: "emote", prop: "heart", text: "", label: "Love it", glyph: "💚" },
  { id: "bolt", kind: "emote", prop: "bolt", text: "", label: "Zap", glyph: "⚡" },
  { id: "hourglass", kind: "emote", prop: "hourglass", text: "", label: "Waiting", glyph: "⏳" },
  { id: "swords", kind: "emote", prop: "swords", text: "", label: "Bring it", glyph: "⚔️" },
  // ── Quick messages ───────────────────────────────────────────────────────
  { id: "glhf", kind: "message", prop: "heart", text: "Good luck!", label: "Good luck!", glyph: "💚", moment: "lobby" },
  { id: "bringit", kind: "message", prop: "swords", text: "Bring it!", label: "Bring it!", glyph: "⚔️", moment: "lobby" },
  { id: "catch", kind: "message", prop: "rocket", text: "Catch me!", label: "Catch me!", glyph: "🚀", moment: "climb" },
  { id: "nice", kind: "message", prop: "bolt", text: "Nice move!", label: "Nice move!", glyph: "⚡", moment: "climb" },
  { id: "close", kind: "message", prop: "flame", text: "Close one!", label: "Close one!", glyph: "🔥", moment: "climb" },
  { id: "slow", kind: "message", prop: "hourglass", text: "Too slow!", label: "Too slow!", glyph: "⏳", moment: "climb" },
  { id: "gg", kind: "message", prop: "thumbs", text: "GG", label: "Good game", glyph: "👍", moment: "result" },
  { id: "wp", kind: "message", prop: "crown", text: "Well played", label: "Well played", glyph: "👑", moment: "result" },
  { id: "rematch", kind: "message", prop: "swords", text: "Rematch?", label: "Rematch?", glyph: "⚔️", moment: "result" },
];

/** The props, in tray order. */
export const EMOTE_PROPS: readonly Emote[] = EMOTES.filter((e) => e.kind === "emote");
/** The quick messages, in catalog order (lobby, climb, result). */
export const QUICK_MESSAGES: readonly Emote[] = EMOTES.filter((e) => e.kind === "message");

/**
 * Quick messages with the lines for `moment` first, then the rest in catalog
 * order. The tray shows all of them; this only decides which are nearest the
 * thumb.
 */
export function quickMessagesFor(moment: DuelMoment): Emote[] {
  const first = QUICK_MESSAGES.filter((e) => e.moment === moment);
  const rest = QUICK_MESSAGES.filter((e) => e.moment !== moment);
  return [...first, ...rest];
}

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
export const EMOTE_MIN_GAP_MS = 1500;
export const EMOTE_BURST = 4;
export const EMOTE_WINDOW_MS = 10_000;

/**
 * Rate gate for emotes. The sender uses one to keep a player from flooding
 * the channel; the receiver uses another so a peer that skips the client
 * check still cannot flood the screen.
 */
export function createEmoteGate(
  minGapMs = EMOTE_MIN_GAP_MS,
  burst = EMOTE_BURST,
  windowMs = EMOTE_WINDOW_MS
): { tryTake(now: number): boolean; /** ms until the next send is allowed; 0 when open. */ waitMs(now: number): number } {
  const recent: number[] = [];
  const prune = (now: number) => {
    while (recent.length > 0 && now - recent[0] >= windowMs) recent.shift();
  };
  return {
    tryTake(now: number): boolean {
      prune(now);
      const last = recent[recent.length - 1];
      if (last !== undefined && now - last < minGapMs) return false;
      if (recent.length >= burst) return false;
      recent.push(now);
      return true;
    },
    waitMs(now: number): number {
      prune(now);
      let wait = 0;
      const last = recent[recent.length - 1];
      if (last !== undefined && now - last < minGapMs) wait = minGapMs - (now - last);
      if (recent.length >= burst) wait = Math.max(wait, windowMs - (now - recent[0]));
      return wait;
    },
  };
}
