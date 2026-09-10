/**
 * Paid-queue collusion guard.
 *
 * The public per-tier matchmaker should not auto-pair two accounts that are
 * plainly the same person (same client IP) — that's the easiest chip-dumping /
 * self-play vector. We remember each waiting room creator's IP as a salted-free
 * SHA-256 (never the raw IP) in Redis, TTL'd to the room's lifetime, and drop
 * same-IP candidates at match time.
 *
 * This is a first-line guard, not a complete anti-fraud system: it only blocks
 * *auto-matching* strangers who share an IP. Deliberate private-link joins are
 * unaffected (you chose that opponent), and it fails OPEN — a Redis hiccup must
 * never strand real matchmaking. Repeat-pairing / velocity detection is a
 * follow-up.
 */

import crypto from "crypto";
import { getRedis } from "./redis";

/** 2h — comfortably longer than a pending room lives before it is swept. */
const CIP_TTL_SECONDS = 7200;
const cipKey = (duelId: string) => `duel:paid:cip:${duelId}`;

/** Hash an IP for storage — we compare hashes, never persist the raw address. */
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/** Remember a waiting room's creator IP hash so the matcher can avoid same-IP pairings. */
export async function rememberRoomCreatorIp(duelId: string, ipHash: string): Promise<void> {
  try {
    await getRedis().set(cipKey(duelId), ipHash, { ex: CIP_TTL_SECONDS });
  } catch {
    // Best-effort — the guard fails open.
  }
}

/**
 * Drop candidates whose creator shares the joiner's IP hash. Fails open (returns
 * the candidates unchanged) if Redis is unavailable, so matchmaking never stalls.
 */
export async function filterSameIpCandidates<T extends { id: string }>(
  candidates: T[],
  joinerIpHash: string
): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  let hashes: (string | null)[];
  try {
    hashes = await getRedis().mget<(string | null)[]>(
      ...candidates.map((c) => cipKey(c.id))
    );
  } catch {
    return candidates;
  }
  return candidates.filter((_, i) => hashes[i] == null || hashes[i] !== joinerIpHash);
}
