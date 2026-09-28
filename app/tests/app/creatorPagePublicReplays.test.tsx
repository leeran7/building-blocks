/**
 * SEC-DC-16 at the page (verifier): /c/[username] is public, so the markup it
 * actually renders must not carry an open daily run's replay token. This
 * renders the real page server component (page -> getCreatorProfileByUsername
 * -> getPublicClimbReplays -> CreatorProfile) over an in-memory climb_runs
 * table. The "board still open" instant is not hand-written: it is the last
 * instant the production submission check still accepts that day's seed.
 */

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRun {
  id: string;
  userId: string;
  peak_y: number;
  created_at: Date;
  replay_token: string | null;
  seed: string;
}
const runs: FakeRun[] = [];

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("../../src/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("../../src/db/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { username?: string } }) =>
        where.username === "climber"
          ? { id: "u1", display_name: "Climber", username: "climber", avatar_id: null }
          : null,
      ),
    },
    climbRun: {
      findMany: vi.fn(async ({ where, take }: { where: { userId: string }; take: number }) =>
        runs
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, take),
      ),
    },
    // A climb record, so CreatorProfile renders its replay list at all.
    climbRecord: {
      findUnique: vi.fn(async () => ({ peak_y: 42, wins: 0, user: { display_name: "Climber", avatar_id: null } })),
      count: vi.fn(async () => 1),
    },
    savedSocialHandle: { findMany: vi.fn(async () => []) },
  },
}));

import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";
vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);

import CreatorPage, { generateMetadata } from "../../app/c/[username]/page";
import { dailySeedFor, submissionDayForSeed } from "../../src/lib/dailySeedServer";
import { DAILY_SUBMIT_GRACE_MS, MS_PER_DAY } from "../../src/lib/dailyDay";

const DAY = "2026-09-26";
const DAY_START = Date.parse(`${DAY}T00:00:00Z`);
const DAILY_SEED = dailySeedFor(DAY);
const ENDLESS_SEED = "0f1e2d3c4b5a6978";

function addRun(id: string, seed: string, createdAt: Date): void {
  runs.push({ id, userId: "u1", peak_y: 42, created_at: createdAt, replay_token: `TOKEN_${id}`, seed });
}

async function pageHtml(username = "climber"): Promise<string> {
  const el = (await CreatorPage({ params: Promise.resolve({ username }) })) as ReactElement;
  return renderToStaticMarkup(el);
}

/** Replay tokens linked from the rendered page. */
async function linkedTokens(): Promise<string[]> {
  const html = await pageHtml();
  return [...html.matchAll(/\/play\?r=([A-Za-z0-9_%-]+)/g)].map((m) => decodeURIComponent(m[1])).sort();
}

beforeEach(() => {
  runs.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("/c/[username] renders no open daily replay token (SEC-DC-16)", () => {
  it("while the day's board accepts the run: the daily link is absent and the endless link present", async () => {
    addRun("daily", DAILY_SEED, new Date(`${DAY}T09:30:00Z`));
    addRun("endless", ENDLESS_SEED, new Date(`${DAY}T09:31:00Z`));
    vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
    expect(submissionDayForSeed(DAILY_SEED, Date.now())).toBe(DAY);
    const html = await pageHtml();
    expect(await linkedTokens()).toEqual(["TOKEN_endless"]);
    expect(html).not.toContain("TOKEN_daily");
  });

  it("a run saved at the day's last millisecond stays hidden at the last instant its board accepts submissions", async () => {
    addRun("late", DAILY_SEED, new Date(DAY_START + MS_PER_DAY - 1));
    const lastAccept = DAY_START + MS_PER_DAY + DAILY_SUBMIT_GRACE_MS;
    // Precondition from production: the seed is still accepted then, and not 1 ms later.
    expect(submissionDayForSeed(DAILY_SEED, lastAccept)).toBe(DAY);
    expect(submissionDayForSeed(DAILY_SEED, lastAccept + 1)).toBeNull();
    vi.setSystemTime(lastAccept);
    expect(await pageHtml()).not.toContain("TOKEN_late");
  });

  it("a run saved at the day's first millisecond is hidden 1 ms before 48 h and linked at 48 h", async () => {
    addRun("early", DAILY_SEED, new Date(DAY_START));
    vi.setSystemTime(DAY_START + 2 * MS_PER_DAY - 1);
    expect(await linkedTokens()).toEqual([]);
    vi.setSystemTime(DAY_START + 2 * MS_PER_DAY);
    expect(await linkedTokens()).toEqual(["TOKEN_early"]);
  });

  it("an undatable daily run is never linked, and the page still renders", async () => {
    // An invalid Date makes the summary's toISOString throw, and the creator
    // loader's catch drops the replay list: fail-closed for every run on it.
    addRun("undatable", DAILY_SEED, new Date(Number.NaN));
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const html = await pageHtml();
    expect(html).toContain("Best height");
    expect(html).not.toContain("TOKEN_undatable");
  });

  it("a non-daily run saved seconds ago is linked at once", async () => {
    addRun("fresh", ENDLESS_SEED, new Date(`${DAY}T11:59:50Z`));
    vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
    expect(await linkedTokens()).toEqual(["TOKEN_fresh"]);
  });

  it("the page metadata carries no replay token either", async () => {
    addRun("daily", DAILY_SEED, new Date(`${DAY}T09:30:00Z`));
    vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
    const meta = await generateMetadata({ params: Promise.resolve({ username: "climber" }) });
    expect(JSON.stringify(meta)).toContain("Climber");
    expect(JSON.stringify(meta)).not.toContain("TOKEN_");
  });
});

describe("control: rendering works for a real page", () => {
  it("an unknown username is a 404", async () => {
    await expect(pageHtml("nobody")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("the page element renders CreatorProfile markup (not an empty shell)", async () => {
    vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
    const html = await pageHtml();
    expect(html).toContain("@climber");
    expect(html).toContain("Best height");
  });
});
