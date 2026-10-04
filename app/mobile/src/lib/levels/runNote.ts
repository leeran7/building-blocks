/**
 * The device's note of a level run in progress, so a run cut short by a
 * reload or an app restart is not lost in silence.
 *
 * The server spends the life when it issues the ticket, and the ticket is held
 * only in router state. When the app loses that state mid-run, the open ticket
 * later closes as abandoned, which counts as a loss (design §6.3). There is no
 * refund and no resume: the map only says what happened.
 *
 * Device-only and advisory: nothing here is sent to the server or trusted by
 * it. A lost or malformed note only means the notice does not show.
 */

/** A run the device started and has not seen scored yet. */
export interface RunNote {
  season: number;
  level: number;
  ticketId: string;
  /** Whether the level spent a life when the run started (not a tutorial level). */
  costsLife: boolean;
}

const STORAGE_PREFIX = "doomstack:levels:run-in-progress:v1";
const MAX_SEASON = 999;
const MAX_LEVEL = 9999;
const MAX_TICKET_ID_LENGTH = 128;

function isCount(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
}

/** A stored note, or null when it is missing or malformed in any way. */
export function parseRunNote(raw: string | null): RunNote | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isCount(o.season, MAX_SEASON) || !isCount(o.level, MAX_LEVEL)) return null;
  if (typeof o.ticketId !== "string" || o.ticketId.length === 0 || o.ticketId.length > MAX_TICKET_ID_LENGTH) return null;
  if (typeof o.costsLife !== "boolean") return null;
  return { season: o.season, level: o.level, ticketId: o.ticketId, costsLife: o.costsLife };
}

export interface RunNoteStore {
  /** The note, or null. */
  get(): RunNote | null;
  /** Record a run that just started; it replaces any older note. */
  save(note: RunNote): void;
  /** Forget the note, only when it is for `ticketId`. */
  clear(ticketId: string): void;
  /** Return the note and forget it. */
  take(): RunNote | null;
}

export interface RunNoteStoreOptions {
  /** The signed-in account; each keeps its own note. */
  accountId?: string | null;
  load?: (key: string) => string | null;
  save?: (key: string, raw: string) => void;
  remove?: (key: string) => void;
}

function localLoad(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSave(key: string, raw: string): void {
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* private mode or quota: an interrupted run goes unmentioned */
  }
}

function localRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was saved either */
  }
}

export function createRunNoteStore(opts: RunNoteStoreOptions = {}): RunNoteStore {
  const key = `${STORAGE_PREFIX}:${opts.accountId ?? "anon"}`;
  const load = opts.load ?? localLoad;
  const write = opts.save ?? localSave;
  const remove = opts.remove ?? localRemove;
  const get = () => parseRunNote(load(key));
  return {
    get,
    save(note) {
      if (parseRunNote(JSON.stringify(note)) === null) return;
      write(key, JSON.stringify(note));
    },
    clear(ticketId) {
      if (get()?.ticketId === ticketId) remove(key);
    },
    take() {
      const note = get();
      remove(key);
      return note;
    },
  };
}

// ── This app session's live ticket ───────────────────────────────────────────

/**
 * The ticket most recently issued in this JavaScript session and not yet left.
 * A reload or a restart starts a new session with none, so a ticket that router
 * state still holds after a page reload (history.state survives it) is not
 * taken as live: replaying it would be a free retry on one spent life. Leaving
 * the play screen releases it too, so browser Back then Forward cannot replay
 * the same ticket either.
 */
let liveTicketId: string | null = null;
/** Tickets whose play screen unmounted, released unless it mounts again first. */
const pendingRelease = new Set<string>();

/** Mark `ticketId` as the run this session just started. */
export function markTicketLive(ticketId: string): void {
  pendingRelease.delete(ticketId);
  liveTicketId = ticketId;
}

/** Whether `ticketId` was issued in this session (and is the latest one). */
export function isTicketLive(ticketId: string): boolean {
  return liveTicketId !== null && liveTicketId === ticketId;
}

/**
 * The play screen running `ticketId` mounted. Cancels a release still pending
 * from an unmount in the same task (React StrictMode's dev-only remount).
 */
export function holdLiveTicket(ticketId: string): void {
  pendingRelease.delete(ticketId);
}

/**
 * The play screen running `ticketId` unmounted. Unless it mounts again in the
 * same task (StrictMode), the ticket stops being live and `onLeft` runs: the
 * player left the run (Back, Android hardware back), which is a quit.
 */
export function releaseLiveTicket(ticketId: string, onLeft: () => void): void {
  pendingRelease.add(ticketId);
  queueMicrotask(() => {
    if (!pendingRelease.delete(ticketId)) return;
    if (liveTicketId === ticketId) liveTicketId = null;
    onLeft();
  });
}

/** The level run a new ticket is for, when the season names it. */
export interface RunStart {
  season: number;
  level: number;
  costsLife: boolean;
}

/**
 * Bookkeeping for a run the server just issued `ticketId` for: it is this
 * session's live ticket, and the device notes it so a reload or restart mid-run
 * is mentioned later. With no `run` (season not loaded) only the first holds.
 * `live: false` is a ticket that arrived after its screen was left (Retry, then
 * Map before the reply): nobody plays it, so only the note is kept and the map
 * reports the spent run instead of taking it for one still being played.
 */
export function noteRunStarted(
  store: RunNoteStore,
  ticketId: string,
  run: RunStart | null,
  opts: { live?: boolean } = {},
): void {
  if (opts.live !== false) markTicketLive(ticketId);
  if (run) store.save({ ...run, ticketId });
}

// ── The notice on the map ────────────────────────────────────────────────────

/** Copy when the play screen bounced and no note says which run it was. */
export const RUN_ENDED_COPY = "That run has ended.";

/** The one-line notice for a run that did not finish. */
export function interruptedCopy(note: RunNote): string {
  const head = `Your last run of level ${note.level} was interrupted, so it counts as a loss`;
  return note.costsLife ? `${head} and used a life.` : `${head}.`;
}

export interface RunNotice {
  /** The level the notice is about, or null when it is not about one. */
  level: number | null;
  text: string;
}

/**
 * What the map says when it opens, and whether the note is used up.
 *
 * - `bounced`: the play screen sent the player here because its run had no
 *   ticket. The run is gone either way, so a note is always used up.
 * - Otherwise (a plain visit, such as the launch after a restart) only a note
 *   left by an earlier session counts: a note for this session's live ticket
 *   is a run the player left on purpose and is kept.
 *
 * A note from another season is used up without a notice: its level number
 * would point at the wrong tower.
 */
export function runNoticeFor(input: {
  note: RunNote | null;
  season: number;
  bounced: boolean;
  live: (ticketId: string) => boolean;
}): { notice: RunNotice | null; consume: boolean } {
  const { note, season, bounced, live } = input;
  if (note === null) return { notice: bounced ? { level: null, text: RUN_ENDED_COPY } : null, consume: false };
  if (!bounced && live(note.ticketId)) return { notice: null, consume: false };
  if (note.season !== season) return { notice: bounced ? { level: null, text: RUN_ENDED_COPY } : null, consume: true };
  return { notice: { level: note.level, text: interruptedCopy(note) }, consume: true };
}

/** Where the map lands: the level card to open, and the notice to show. */
export interface MapLanding {
  open: number | null;
  notice: RunNotice | null;
}

/**
 * Which card the map opens on arrival and which notice it shows.
 *
 * - `openLevel`: the card the route asked for (Next level, or the bounced
 *   run's level); only a level at or below the frontier opens.
 * - "That run has ended." names no level: when bounced it belongs on the card
 *   the run bounced to.
 * - A notice about a different level than the card would open is not left in
 *   a banner behind that card: its own level's card opens instead, or, when
 *   that level is not open, no card does and the banner shows alone.
 */
export function mapLanding(input: {
  notice: RunNotice | null;
  openLevel: number | null;
  bounced: boolean;
  frontier: number;
}): MapLanding {
  const { openLevel, bounced, frontier } = input;
  const notice = input.notice && input.notice.level === null && bounced ? { ...input.notice, level: openLevel } : input.notice;
  const open = openLevel !== null && openLevel <= frontier ? openLevel : null;
  if (open === null || notice === null || notice.level === null || notice.level === open) return { open, notice };
  return { open: notice.level <= frontier ? notice.level : null, notice };
}
