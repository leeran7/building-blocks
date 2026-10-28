/**
 * Tournaments are announced but closed (TOURNAMENTS_COMING_SOON). Every
 * tournament route must answer 503 COMING_SOON without touching the database
 * or Stripe, and both /tournaments pages must say "coming soon" rather than
 * ask a visitor to sign in and enter (the broken promise found in Phase 4).
 */

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isValidElement } from "react";

vi.mock("../../src/db/tournaments", () => ({
  listTournaments: vi.fn(),
  getTournament: vi.fn(),
  getTournamentBracket: vi.fn(),
  registerForTournament: vi.fn(),
  queueForTournament: vi.fn(),
  getQueueStatus: vi.fn(),
}));
vi.mock("../../src/lib/requireAuth", () => ({ requireAuth: vi.fn(), AuthError: class extends Error {} }));
vi.mock("../../src/api/stripeConnect", () => ({ createEntryFeeCheckout: vi.fn() }));
// Loads Firebase Admin on import, which CI has no keys for.
vi.mock("../../src/db/notification", () => ({ createNotification: vi.fn() }));

import * as db from "../../src/db/tournaments";
import { requireAuth } from "../../src/lib/requireAuth";
import { createEntryFeeCheckout } from "../../src/api/stripeConnect";
import { createNotification } from "../../src/db/notification";
import { TOURNAMENTS_COMING_SOON } from "../../src/config/tournaments";
import { GET as list } from "../../app/api/tournaments/route";
import { GET as detail } from "../../app/api/tournaments/[id]/route";
import { POST as register } from "../../app/api/tournaments/[id]/register/route";
import { POST as checkout } from "../../app/api/tournaments/[id]/checkout/route";
import { GET as queueStatus, POST as joinQueue } from "../../app/api/tournaments/queue/route";
import TournamentsPage from "../../app/tournaments/page";
import TournamentPage from "../../app/tournaments/[id]/page";
import { TournamentsComingSoon } from "../../src/components/Tournament/TournamentsComingSoon";

const req = (path: string, method = "GET") =>
  new NextRequest(`http://localhost${path}`, { method, headers: { Authorization: "Bearer t" } });
const params = { params: Promise.resolve({ id: "t1" }) };

describe("tournaments while coming soon", () => {
  it("is the shipped state", () => {
    expect(TOURNAMENTS_COMING_SOON).toBe(true);
  });

  it("answers 503 COMING_SOON on every route and never reaches the database, auth or Stripe", async () => {
    const responses = [
      await list(req("/api/tournaments")),
      await detail(req("/api/tournaments/t1"), params),
      await register(req("/api/tournaments/t1/register", "POST"), params),
      await checkout(req("/api/tournaments/t1/checkout", "POST"), params),
      await queueStatus(),
      await joinQueue(req("/api/tournaments/queue", "POST")),
    ];
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Tournaments are coming soon", code: "COMING_SOON" });
    }
    for (const fn of Object.values(db)) expect(fn).not.toHaveBeenCalled();
    expect(requireAuth).not.toHaveBeenCalled();
    expect(createEntryFeeCheckout).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("renders the coming-soon page on /tournaments and on a tournament link", async () => {
    for (const el of [await TournamentsPage(), await TournamentPage(params)]) {
      expect(isValidElement(el)).toBe(true);
      expect((el as { type: unknown }).type).toBe(TournamentsComingSoon);
    }
  });
});
