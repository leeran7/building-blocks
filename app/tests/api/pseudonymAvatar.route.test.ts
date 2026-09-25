/**
 * A player with no display name is named by climberDisplay, whose animal
 * follows their avatar. Every server path that names a player, or hands a
 * client the fields to name one, must use the avatar:
 *
 *   - leaderboards and climb/creator reads build `handle` / `name` server-side;
 *   - friends, friend requests, user search and challenges return `avatarId`
 *     (allow-listed) next to `displayName` for the client to name them;
 *   - friend and challenge notifications bake the name into their text.
 *
 * Real route handlers and src/db/* run against an in-memory Prisma that honours
 * each query's `select`, so a query that forgets `avatar_id` produces the hash
 * animal and fails here. Only auth, rate limiting, notification writes and the
 * mutating db calls whose SQL is not under test are mocked. User search has
 * its own select-honouring test (usersSearch.route.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../../src/db/client", async () => ({ prisma: (await import("./fakeSocialPrisma")).fakePrisma }));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

const auth = vi.hoisted(() => ({ uid: "me-1" }));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: auth.uid, email: `${auth.uid}@e.com`, email_verified: true })),
}));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn(async () => {}) }));

const { createNotification } = vi.hoisted(() => ({
  createNotification: vi.fn(async (_n: { title: string; body: string; data: Record<string, unknown> }) => ({})),
}));
vi.mock("../../src/db/notification", () => ({ createNotification }));

// Mutations whose SQL is not under test. Each returns what the real one would,
// read back through the fake, so the route still names players from real rows.
vi.mock("../../src/db/friendship", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/db/friendship")>();
  const { befriend } = await import("./fakeSocialPrisma");
  return {
    ...real,
    sendFriendRequest: vi.fn(async (senderId: string, receiverId: string) => ({
      ok: true,
      friendship: { ...befriend(senderId, receiverId, "pending") },
    })),
    acceptFriendRequest: vi.fn(async () => ({ ok: true })),
  };
});
vi.mock("../../src/db/challenge", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/db/challenge")>();
  const { challengeBetween } = await import("./fakeSocialPrisma");
  return {
    ...real,
    createChallenge: vi.fn(async (senderId: string, recipientId: string) => ({
      outcome: "created",
      challenge: await real.getChallenge(challengeBetween(senderId, recipientId).id),
    })),
    acceptChallenge: vi.fn(async (id: string, _uid: string, duelId: string) => ({
      outcome: "accepted",
      challenge: await real.getChallenge(id),
      duelId,
      replay: false,
    })),
    declineChallenge: vi.fn(async () => ({ outcome: "declined" })),
  };
});

import { addUser, befriend, challengeBetween, db, resetDb } from "./fakeSocialPrisma";
import { climberDisplay, climberHandle } from "../../src/lib/handle";
import { FREE_STACK_SLUG } from "../../src/game/freeStack";
import {
  friendsLeaderboard,
  getUserFreeClimbRecord,
  recordClimb,
  topFreeClimbers,
} from "../../src/db/climb";
import { getCreatorProfileByUsername } from "../../src/db/creator";
import { GET as getFriends, POST as postFriend } from "../../app/api/friends/route";
import { GET as getFriendRequests } from "../../app/api/friends/requests/route";
import { POST as acceptFriend } from "../../app/api/friends/[id]/accept/route";
import { GET as listChallenges, POST as postChallenge } from "../../app/api/challenge/route";
import { GET as getChallengeById } from "../../app/api/challenge/[id]/route";
import { POST as acceptChallengeRoute } from "../../app/api/challenge/[id]/accept/route";
import { POST as declineChallengeRoute } from "../../app/api/challenge/[id]/decline/route";
import { GET as getClimbLeaderboard } from "../../app/api/climb/leaderboard/route";
import { GET as getFriendsBoard } from "../../app/api/climb/leaderboard/friends/route";

// Players. None of their hash animals is the avatar they picked (checked below),
// so a path that ignores the avatar yields a visibly different name.
const WOLF = "wolfy-7";
const NAMED = "named-4";
const WRAITH = "wraithy-2";
const RETIRED = "retired-5";
const ME = "me-1";

const WOLF_NAME = climberHandle(WOLF, "wolf");

interface ClientUser {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarId?: string | null;
}
/** What every client component does with a user from these payloads. */
const clientName = (u: ClientUser) => climberDisplay(u.id, u.displayName, u.avatarId);

const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function seed() {
  addUser({ id: ME, avatar_id: "falcon" });
  addUser({ id: WOLF, avatar_id: "wolf", username: "wolfy" });
  addUser({ id: NAMED, display_name: "Aria", avatar_id: "wolf" });
  addUser({ id: WRAITH, avatar_id: "wraith" });
  addUser({ id: RETIRED, avatar_id: "retired-avatar" });
  for (const [id, peak] of [[WOLF, 900], [NAMED, 800], [WRAITH, 700], [RETIRED, 600], [ME, 500]] as const) {
    db.records.push({ userId: id, category_slug: FREE_STACK_SLUG, peak_y: peak, wins: 0, updated_at: new Date(0) });
  }
}

/** The name each player must get on every surface. */
const EXPECTED: Record<string, string> = {
  [WOLF]: WOLF_NAME,
  [NAMED]: "Aria",
  [WRAITH]: climberHandle(WRAITH),
  [RETIRED]: climberHandle(RETIRED),
  [ME]: climberHandle(ME, "falcon"),
};

beforeEach(() => {
  resetDb();
  seed();
  auth.uid = ME;
  createNotification.mockClear();
});

describe("fixtures", () => {
  it("pick avatars that differ from each player's hash animal", () => {
    expect(WOLF_NAME).toMatch(/ Wolf \d+$/);
    expect(climberHandle(WOLF)).not.toBe(WOLF_NAME);
    expect(climberHandle(ME)).not.toBe(EXPECTED[ME]);
    expect(climberHandle(NAMED, "wolf")).not.toBe(climberHandle(NAMED));
  });
});

describe("server-built names follow the avatar", () => {
  it("topFreeClimbers and GET /api/climb/leaderboard", async () => {
    const board = await topFreeClimbers(50);
    expect(Object.fromEntries(board.map((c) => [c.userId, c.handle]))).toEqual(EXPECTED);

    const body = (await (await getClimbLeaderboard()).json()) as { climbers: Array<{ userId: string; handle: string }> };
    expect(Object.fromEntries(body.climbers.map((c) => [c.userId, c.handle]))).toEqual(EXPECTED);
  });

  it("friendsLeaderboard and GET /api/climb/leaderboard/friends", async () => {
    for (const id of [WOLF, NAMED, WRAITH, RETIRED]) befriend(ME, id);
    const board = await friendsLeaderboard(ME);
    expect(Object.fromEntries(board.climbers.map((c) => [c.userId, c.handle]))).toEqual(EXPECTED);

    const res = await getFriendsBoard(req("/api/climb/leaderboard/friends"));
    const body = (await res.json()) as { climbers: Array<{ userId: string; handle: string }> };
    expect(Object.fromEntries(body.climbers.map((c) => [c.userId, c.handle]))).toEqual(EXPECTED);
  });

  it("recordClimb and getUserFreeClimbRecord (post-climb readout, dashboard)", async () => {
    const run = await recordClimb({ userId: WOLF, peakY: 100, finished: false, finishedTick: null, seed: "s" });
    expect(run.handle).toBe(WOLF_NAME);
    expect((await getUserFreeClimbRecord(WOLF))?.handle).toBe(WOLF_NAME);
    expect((await getUserFreeClimbRecord(NAMED))?.handle).toBe("Aria");
  });

  it("creator public profile (/c/[username])", async () => {
    expect((await getCreatorProfileByUsername("wolfy"))?.name).toBe(WOLF_NAME);
  });
});

describe("client-named payloads carry an allow-listed avatarId", () => {
  it("GET /api/friends", async () => {
    for (const id of [WOLF, NAMED, WRAITH, RETIRED]) befriend(ME, id);
    const body = (await (await getFriends(req("/api/friends"))).json()) as { friends: Array<{ user: ClientUser }> };
    const users = body.friends.map((f) => f.user);
    expect(Object.fromEntries(users.map((u) => [u.id, u.avatarId]))).toEqual({
      [WOLF]: "wolf",
      [NAMED]: "wolf",
      [WRAITH]: "wraith",
      [RETIRED]: null,
    });
    expect(Object.fromEntries(users.map((u) => [u.id, clientName(u)]))).toEqual({
      [WOLF]: EXPECTED[WOLF],
      [NAMED]: EXPECTED[NAMED],
      [WRAITH]: EXPECTED[WRAITH],
      [RETIRED]: EXPECTED[RETIRED],
    });
  });

  it("GET /api/friends/requests (incoming sender and outgoing receiver)", async () => {
    befriend(WOLF, ME, "pending");
    befriend(ME, RETIRED, "pending");
    const body = (await (await getFriendRequests(req("/api/friends/requests"))).json()) as {
      incoming: Array<{ sender: ClientUser }>;
      outgoing: Array<{ receiver: ClientUser }>;
    };
    expect(body.incoming.map((r) => [r.sender.avatarId, clientName(r.sender)])).toEqual([["wolf", WOLF_NAME]]);
    expect(body.outgoing.map((r) => [r.receiver.avatarId, clientName(r.receiver)])).toEqual([
      [null, EXPECTED[RETIRED]],
    ]);
  });

  it("GET /api/challenge and GET /api/challenge/[id]", async () => {
    const received = challengeBetween(WOLF, ME);
    challengeBetween(ME, RETIRED);
    const list = (await (await listChallenges(req("/api/challenge"))).json()) as Array<{
      id: string;
      sender: ClientUser;
      recipient: ClientUser;
    }>;
    const names = list.map((c) => [clientName(c.sender), c.sender.avatarId, clientName(c.recipient), c.recipient.avatarId]);
    expect(names).toEqual([
      [WOLF_NAME, "wolf", EXPECTED[ME], "falcon"],
      [EXPECTED[ME], "falcon", EXPECTED[RETIRED], null],
    ]);

    const one = (await (await getChallengeById(req(`/api/challenge/${received.id}`), params(received.id))).json()) as {
      sender: ClientUser;
    };
    expect([one.sender.avatarId, clientName(one.sender)]).toEqual(["wolf", WOLF_NAME]);
  });
});

describe("notifications name the actor with their avatar", () => {
  const lastNotification = () => createNotification.mock.calls.at(-1)?.[0];

  it("friend request sent (POST /api/friends)", async () => {
    auth.uid = WOLF;
    const res = await postFriend(req("/api/friends", { method: "POST", body: { receiverId: ME } }));
    expect(res.status).toBe(201);
    expect(lastNotification()?.title).toBe(`${WOLF_NAME} sent you a friend request`);
    expect(lastNotification()?.data.senderName).toBe(WOLF_NAME);
  });

  it("friend request accepted (POST /api/friends/[id]/accept)", async () => {
    const f = befriend(ME, WOLF, "pending");
    auth.uid = WOLF;
    const res = await acceptFriend(req(`/api/friends/${f.id}/accept`, { method: "POST" }), params(f.id));
    expect(res.status).toBe(200);
    expect(lastNotification()?.title).toBe(`${WOLF_NAME} accepted your friend request`);
  });

  it("challenge received (POST /api/challenge)", async () => {
    auth.uid = WOLF;
    const res = await postChallenge(req("/api/challenge", { method: "POST", body: { recipientId: ME } }));
    expect(res.status).toBe(201);
    expect(lastNotification()?.body).toBe(`${WOLF_NAME} challenged you to a 1v1 duel!`);
    expect(lastNotification()?.data.senderName).toBe(WOLF_NAME);
    const body = (await res.json()) as { sender: ClientUser };
    expect([body.sender.avatarId, clientName(body.sender)]).toEqual(["wolf", WOLF_NAME]);
  });

  it("challenge accepted and declined (POST /api/challenge/[id]/accept|decline)", async () => {
    const a = challengeBetween(ME, WOLF);
    auth.uid = WOLF;
    expect((await acceptChallengeRoute(req(`/api/challenge/${a.id}/accept`, { method: "POST" }), params(a.id))).status).toBe(200);
    expect(lastNotification()?.body).toBe(`${WOLF_NAME} accepted your challenge. The duel is ready!`);

    const d = challengeBetween(ME, WOLF);
    expect((await declineChallengeRoute(req(`/api/challenge/${d.id}/decline`, { method: "POST" }), params(d.id))).status).toBe(200);
    expect(lastNotification()?.body).toBe(`${WOLF_NAME} declined your challenge.`);
  });
});
