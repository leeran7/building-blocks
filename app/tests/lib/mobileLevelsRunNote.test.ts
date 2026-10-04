/**
 * The device's note of a level run in progress (mobile/src/lib/levels/runNote.ts):
 * the allow-list parser, the per-account store, the session's live ticket and
 * the map notice it leads to.
 */

import { describe, expect, it } from "vitest";

import {
  RUN_ENDED_COPY,
  createRunNoteStore,
  holdLiveTicket,
  interruptedCopy,
  isTicketLive,
  mapLanding,
  markTicketLive,
  noteRunStarted,
  parseRunNote,
  releaseLiveTicket,
  runNoticeFor,
  type RunNote,
} from "../../mobile/src/lib/levels/runNote";

const NOTE: RunNote = { season: 1, level: 12, ticketId: "tk-12", costsLife: true };

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    load: (k: string) => data.get(k) ?? null,
    save: (k: string, raw: string) => void data.set(k, raw),
    remove: (k: string) => void data.delete(k),
  };
}

describe("parseRunNote", () => {
  it("reads a well-formed note", () => {
    expect(parseRunNote(JSON.stringify(NOTE))).toEqual(NOTE);
    expect(parseRunNote(JSON.stringify({ ...NOTE, costsLife: false }))).toEqual({ ...NOTE, costsLife: false });
  });

  it("keeps only the known fields", () => {
    expect(parseRunNote(JSON.stringify({ ...NOTE, extra: "x" }))).toEqual(NOTE);
  });

  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["not JSON", "{season:1"],
    ["JSON null", "null"],
    ["an array", JSON.stringify([NOTE])],
    ["a number", "12"],
    ["season missing", JSON.stringify({ level: 12, ticketId: "tk", costsLife: true })],
    ["season as a string", JSON.stringify({ ...NOTE, season: "1" })],
    ["season 0", JSON.stringify({ ...NOTE, season: 0 })],
    ["season too large", JSON.stringify({ ...NOTE, season: 1000 })],
    ["level 0", JSON.stringify({ ...NOTE, level: 0 })],
    ["a fractional level", JSON.stringify({ ...NOTE, level: 1.5 })],
    ["a negative level", JSON.stringify({ ...NOTE, level: -3 })],
    ["level too large", JSON.stringify({ ...NOTE, level: 10000 })],
    ["ticketId missing", JSON.stringify({ season: 1, level: 12, costsLife: true })],
    ["an empty ticketId", JSON.stringify({ ...NOTE, ticketId: "" })],
    ["a numeric ticketId", JSON.stringify({ ...NOTE, ticketId: 42 })],
    ["an over-long ticketId", JSON.stringify({ ...NOTE, ticketId: "t".repeat(129) })],
    ["costsLife as a string", JSON.stringify({ ...NOTE, costsLife: "true" })],
    ["costsLife missing", JSON.stringify({ season: 1, level: 12, ticketId: "tk" })],
  ])("rejects %s", (_label, raw) => {
    expect(parseRunNote(raw)).toBeNull();
  });
});

describe("createRunNoteStore", () => {
  it("saves a run and reads it back", () => {
    const mem = memoryStorage();
    const store = createRunNoteStore({ accountId: "a", ...mem });
    expect(store.get()).toBeNull();
    store.save(NOTE);
    expect(store.get()).toEqual(NOTE);
  });

  it("lets a new run replace the old note", () => {
    const store = createRunNoteStore({ accountId: "a", ...memoryStorage() });
    store.save(NOTE);
    store.save({ ...NOTE, level: 13, ticketId: "tk-13" });
    expect(store.get()).toEqual({ ...NOTE, level: 13, ticketId: "tk-13" });
  });

  it("clears only the note for the ticket named", () => {
    const store = createRunNoteStore({ accountId: "a", ...memoryStorage() });
    store.save(NOTE);
    store.clear("some-older-ticket");
    expect(store.get()).toEqual(NOTE);
    store.clear(NOTE.ticketId);
    expect(store.get()).toBeNull();
  });

  it("take returns the note once", () => {
    const store = createRunNoteStore({ accountId: "a", ...memoryStorage() });
    store.save(NOTE);
    expect(store.take()).toEqual(NOTE);
    expect(store.take()).toBeNull();
  });

  it("keeps each account's note apart", () => {
    const mem = memoryStorage();
    createRunNoteStore({ accountId: "a", ...mem }).save(NOTE);
    expect(createRunNoteStore({ accountId: "b", ...mem }).get()).toBeNull();
    expect(createRunNoteStore({ accountId: "a", ...mem }).get()).toEqual(NOTE);
  });

  it("refuses to save a malformed note", () => {
    const mem = memoryStorage();
    const store = createRunNoteStore({ accountId: "a", ...mem });
    store.save({ ...NOTE, level: 0 });
    store.save({ ...NOTE, ticketId: "" });
    expect(mem.data.size).toBe(0);
  });

  it("treats a corrupted stored value as no note", () => {
    const mem = memoryStorage();
    const store = createRunNoteStore({ accountId: "a", ...mem });
    store.save(NOTE);
    const [key] = [...mem.data.keys()];
    mem.data.set(key, JSON.stringify({ ...NOTE, level: "12" }));
    expect(store.get()).toBeNull();
  });
});

describe("the session's live ticket", () => {
  it("is the ticket most recently marked", () => {
    markTicketLive("first");
    expect(isTicketLive("first")).toBe(true);
    markTicketLive("second");
    expect(isTicketLive("first")).toBe(false);
    expect(isTicketLive("second")).toBe(true);
    expect(isTicketLive("never-issued")).toBe(false);
  });

  it("is released once its play screen unmounts, and the run counts as left", async () => {
    markTicketLive("left");
    let left = 0;
    releaseLiveTicket("left", () => void left++);
    await Promise.resolve();
    expect(isTicketLive("left")).toBe(false);
    expect(left).toBe(1);
  });

  it("stays live when its play screen mounts again in the same task (StrictMode)", async () => {
    markTicketLive("strict");
    let left = 0;
    releaseLiveTicket("strict", () => void left++);
    holdLiveTicket("strict");
    await Promise.resolve();
    expect(isTicketLive("strict")).toBe(true);
    expect(left).toBe(0);
  });

  it("leaves a newer ticket live when an older one's screen unmounts", async () => {
    markTicketLive("older");
    markTicketLive("newer");
    let left = 0;
    releaseLiveTicket("older", () => void left++);
    await Promise.resolve();
    expect(isTicketLive("newer")).toBe(true);
    expect(left).toBe(1);
  });

  it("marks a started run live and notes it, or only marks it with no season", () => {
    const mem = memoryStorage();
    const store = createRunNoteStore({ accountId: "u1", ...mem });
    noteRunStarted(store, "tk-new", { season: 1, level: 12, costsLife: true });
    expect(isTicketLive("tk-new")).toBe(true);
    expect(store.get()).toEqual({ season: 1, level: 12, ticketId: "tk-new", costsLife: true });

    noteRunStarted(store, "tk-unnoted", null);
    expect(isTicketLive("tk-unnoted")).toBe(true);
    expect(store.get()?.ticketId).toBe("tk-new");
  });
});

describe("mapLanding", () => {
  const ended = { level: null, text: RUN_ENDED_COPY };
  const lost = (level: number) => ({ level, text: interruptedCopy({ ...NOTE, level }) });

  it("opens the asked-for card at or below the frontier, and nothing above it", () => {
    expect(mapLanding({ notice: null, openLevel: 4, bounced: false, frontier: 11 })).toEqual({ open: 4, notice: null });
    expect(mapLanding({ notice: null, openLevel: 12, bounced: false, frontier: 11 })).toEqual({ open: null, notice: null });
    expect(mapLanding({ notice: null, openLevel: null, bounced: false, frontier: 11 })).toEqual({ open: null, notice: null });
  });

  it("puts \"That run has ended.\" on the card the run bounced to", () => {
    expect(mapLanding({ notice: ended, openLevel: 4, bounced: true, frontier: 11 })).toEqual({ open: 4, notice: { ...ended, level: 4 } });
    // Not open: a banner, which shows for any level without a card.
    expect(mapLanding({ notice: ended, openLevel: 12, bounced: true, frontier: 11 })).toEqual({ open: null, notice: { ...ended, level: 12 } });
  });

  it("keeps a plain visit's notice in the banner with no card", () => {
    expect(mapLanding({ notice: lost(11), openLevel: null, bounced: false, frontier: 11 })).toEqual({ open: null, notice: lost(11) });
  });

  it("opens the cut-off run's level instead of another level's card", () => {
    expect(mapLanding({ notice: lost(9), openLevel: 4, bounced: true, frontier: 11 })).toEqual({ open: 9, notice: lost(9) });
    expect(mapLanding({ notice: lost(11), openLevel: 4, bounced: false, frontier: 11 })).toEqual({ open: 11, notice: lost(11) });
  });

  it("opens no card when the cut-off run's level is above the frontier", () => {
    expect(mapLanding({ notice: lost(14), openLevel: 4, bounced: true, frontier: 11 })).toEqual({ open: null, notice: lost(14) });
  });
});

describe("runNoticeFor", () => {
  const notLive = () => false;
  const live = (id: string) => id === NOTE.ticketId;

  it("says nothing on a plain visit with no note", () => {
    expect(runNoticeFor({ note: null, season: 1, bounced: false, live: notLive })).toEqual({ notice: null, consume: false });
  });

  it("says an earlier session's run was a loss that used a life, and uses the note up", () => {
    expect(runNoticeFor({ note: NOTE, season: 1, bounced: false, live: notLive })).toEqual({
      notice: { level: 12, text: "Your last run of level 12 was interrupted, so it counts as a loss and used a life." },
      consume: true,
    });
  });

  it("leaves lives out on a free level", () => {
    const free = { ...NOTE, level: 3, costsLife: false };
    expect(runNoticeFor({ note: free, season: 1, bounced: true, live: notLive }).notice?.text).toBe(
      "Your last run of level 3 was interrupted, so it counts as a loss.",
    );
  });

  it("keeps quiet about this session's own run on a plain visit", () => {
    expect(runNoticeFor({ note: NOTE, season: 1, bounced: false, live })).toEqual({ notice: null, consume: false });
  });

  it("names the run when bounced, even if this session started it", () => {
    expect(runNoticeFor({ note: NOTE, season: 1, bounced: true, live })).toEqual({
      notice: { level: 12, text: interruptedCopy(NOTE) },
      consume: true,
    });
  });

  it("says only that the run ended when bounced with no note", () => {
    const verdict = runNoticeFor({ note: null, season: 1, bounced: true, live: notLive });
    expect(verdict).toEqual({ notice: { level: null, text: RUN_ENDED_COPY }, consume: false });
    expect(verdict.notice?.text).not.toMatch(/li(fe|ves)/);
  });

  it("drops a note from another season without naming its level", () => {
    const old = { ...NOTE, season: 2 };
    expect(runNoticeFor({ note: old, season: 1, bounced: false, live: notLive })).toEqual({ notice: null, consume: true });
    expect(runNoticeFor({ note: old, season: 1, bounced: true, live: notLive })).toEqual({
      notice: { level: null, text: RUN_ENDED_COPY },
      consume: true,
    });
  });
});
