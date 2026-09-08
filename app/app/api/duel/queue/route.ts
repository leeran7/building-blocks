/**
 * POST /api/duel/queue — Join the random matchmaking queue.
 * GET  /api/duel/queue — Poll match status (matched / waiting / idle).
 * DELETE /api/duel/queue — Leave the queue.
 *
 * Queue state lives in Redis (Upstash) using two keys per category:
 *   - Sorted set:  "duel:queue:{categorySlug}" (score = timestamp, member = uid)
 *   - Per-user lock: "duel:queue:member:{uid}" (value = categorySlug, TTL 300s)
 *
 * Pairing is done atomically with a Lua script to prevent TOCTOU races.
 * Members stale for more than 300s are removed before checking queue size.
 *
 * Clients JOIN once with POST, then POLL with GET — never re-POST to poll. The
 * waiting player is paired inside the *other* player's POST, so re-POSTing would
 * both blow the join rate limit and re-enqueue the waiting player instead of
 * surfacing the match.
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getRedis } from "../../../../src/lib/redis";
import { newRunSeed } from "../../../../src/game/rng";
import { CATEGORY_BY_SLUG } from "../../../../src/lib/categories";
import { createDuel, getActiveDuelForUser } from "../../../../src/db/duel";
import { ensureUser } from "../../../../src/db/user";
import { DuelStatus } from "@prisma/client";

export const runtime = "nodejs";

const RATE_MAX = 30;
const RATE_WINDOW_SECONDS = 3600; // 1 hour
// The status poll is read-only and hit every ~2s while searching, so it gets a
// far higher ceiling than the join and fails open (a missed poll just delays the
// match hand-off; the next tick recovers).
const POLL_RATE_MAX = 900;
const QUEUE_TTL_SECONDS = 300;

// Lua script: atomically remove stale members, then either enqueue or pair.
// Returns [0, ""] when waiting, [1, waitingUid] when matched, [0, "self"] when
// the only queued member is the requesting user (self-match prevention, W-2).
const PAIR_SCRIPT = `
local queueKey = KEYS[1]
local memberKey = KEYS[2]
local uid = ARGV[1]
local now = tonumber(ARGV[2])
local staleThreshold = now - 300

redis.call('ZREMRANGEBYSCORE', queueKey, '-inf', staleThreshold)

local count = redis.call('ZCARD', queueKey)

if count < 1 then
  redis.call('ZADD', queueKey, now, uid)
  redis.call('SET', memberKey, 'queued', 'EX', 300)
  return {0, ''}
else
  local waiting = redis.call('ZPOPMIN', queueKey, 1)
  local waitingUid = waiting[1]
  if waitingUid == uid then
    redis.call('ZADD', queueKey, now, uid)
    return {0, 'self'}
  end
  redis.call('DEL', 'duel:queue:member:' .. waitingUid)
  return {1, waitingUid}
end
`;

interface PostBody {
  categorySlug?: unknown;
}

export async function POST(request: NextRequest) {
  // Auth: required
  let uid: string;
  let userEmail: string | undefined;
  let emailVerified: boolean | undefined;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
    userEmail = decoded.email;
    emailVerified = decoded.email_verified;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Ensure the user row exists in the DB — the duels table foreign-keys to
  // users(id), and auth/sync is fire-and-forget so it may not have run yet.
  if (userEmail) {
    await ensureUser({
      id: uid,
      email: userEmail,
      emailVerified: emailVerified ?? false,
    }).catch(() => {
      // Best-effort: if this fails, createDuel will fail too and we'll re-enqueue.
    });
  }

  // Rate limit: 30/hour
  const rl = await checkRateLimit({
    namespace: "duel:queue",
    identifier: uid,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const categorySlug =
    typeof body.categorySlug === "string" ? body.categorySlug.toLowerCase().trim() : null;
  if (!categorySlug || !Object.hasOwn(CATEGORY_BY_SLUG, categorySlug)) {
    return NextResponse.json(
      { error: "Unknown category", code: "INVALID_CATEGORY", field: "categorySlug" },
      { status: 400 }
    );
  }

  const redis = getRedis();
  const memberKey = `duel:queue:member:${uid}`;

  // Prevent duplicate queue entries
  const existing = await redis.get(memberKey);
  if (existing) {
    return NextResponse.json(
      { error: "Already in queue", code: "ALREADY_QUEUED" },
      { status: 409 }
    );
  }

  const queueKey = `duel:queue:${categorySlug}`;
  const now = Math.floor(Date.now() / 1000);

  // Atomic Lua script — pair or enqueue
  const result = await redis.eval(
    PAIR_SCRIPT,
    [queueKey, memberKey],
    [uid, String(now)]
  ) as [number, string];

  const matched = result[0] === 1;

  if (!matched) {
    // W-2: If the script returned "self", the user was the only queued member
    // — they were re-enqueued by the script. Fall through to "waiting" response
    // so the client keeps polling. Do not return an error.
    // For the normal waiting case, override the member lock with categorySlug
    // so DELETE can find the right sorted-set key when the user cancels.
    await redis.set(memberKey, categorySlug, { ex: QUEUE_TTL_SECONDS });
    return NextResponse.json({ status: "waiting" });
  }

  // Matched with a waiting player
  const waitingUid = result[1];
  const newId = nanoid(8);
  const seed = newRunSeed();

  // Create the duel row with both players active immediately.
  // If this fails (e.g. FK violation — waiting user's `users` row missing because
  // their auth/sync hasn't run yet), re-enqueue them so they're not stranded.
  try {
    await createDuel(waitingUid, categorySlug, newId, seed, {
      player2Id: uid,
      status: DuelStatus.active,
    });
  } catch (err) {
    console.error("[POST /api/duel/queue] createDuel failed; re-enqueueing waiting user:", err);
    const reNow = Math.floor(Date.now() / 1000);
    await redis.zadd(queueKey, { score: reNow, member: waitingUid });
    await redis.set(`duel:queue:member:${waitingUid}`, categorySlug, { ex: QUEUE_TTL_SECONDS });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "matched", duelId: newId });
}

export async function GET(request: NextRequest) {
  // Auth: required
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // High-ceiling, fail-open limit — this is a read-only 2s poll, not a mutation.
  const rl = await checkRateLimit({
    namespace: "duel:queue:poll",
    identifier: uid,
    max: POLL_RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  // Matched? The pairing happens in the other player's POST and creates an
  // active duel with this user as a participant.
  const match = await getActiveDuelForUser(uid);
  if (match) {
    return NextResponse.json({ status: "matched", duelId: match.id });
  }

  // Still holding a queue slot?
  const redis = getRedis();
  const inQueue = await redis.get(`duel:queue:member:${uid}`);
  return NextResponse.json({ status: inQueue ? "waiting" : "idle" });
}

export async function DELETE(request: NextRequest) {
  // Auth: required
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const redis = getRedis();
  const memberKey = `duel:queue:member:${uid}`;
  const categorySlug = await redis.get<string>(memberKey);

  if (!categorySlug) {
    return NextResponse.json(
      { error: "Not in queue", code: "NOT_IN_QUEUE" },
      { status: 404 }
    );
  }

  const queueKey = `duel:queue:${categorySlug}`;
  await redis.zrem(queueKey, uid);
  await redis.del(memberKey);

  return NextResponse.json({ status: "cancelled" });
}
