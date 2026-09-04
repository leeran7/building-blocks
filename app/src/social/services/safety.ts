/**
 * AI safety / guardrail primitives (Epic O).
 *
 * These are hard, server-enforced rules — never a prompt instruction the model
 * could be talked out of. Every mutating tool/service call runs through
 * `sanitizeForStorage`/`sanitizeForResponse` before anything touches the DB or
 * a client response (AC-55), and `checkAvoidTerms`/`validateCaptionLength`
 * gate a draft before it can leave DRAFT (AC-13/AC-17).
 */

import { randomBytes } from "crypto";
import { PLATFORM_CAPTION_LIMITS } from "../types";
import type { SocialPlatform } from "../types";

const SECRET_KEY_PATTERN =
  /token|secret|password|authorization|api[_-]?key|client[_-]?secret|private[_-]?key|refreshtoken|accesstoken|sessionuri/i;

/**
 * Deep-clones a value while stripping any object key that looks credential-
 * shaped. Used before persisting agent tool I/O, publication raw responses,
 * or analytics raw responses (AC-55) — belt-and-suspenders alongside never
 * putting a raw token into these structures in the first place.
 */
export function sanitizeForStorage<T>(value: T): T {
  return stripSecrets(value) as T;
}

/** Same redaction, used for the last line of defense: outbound API/chat responses. */
export function sanitizeForResponse<T>(value: T): T {
  return stripSecrets(value) as T;
}

function stripSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, seen));
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = stripSecrets(v, seen);
      }
    }
    return out;
  }
  return value;
}

/**
 * AC-13: a draft whose text contains a brand-profile "topics to avoid" term
 * must never silently reach READY_FOR_REVIEW. Simple case-insensitive
 * substring match — deterministic, no AI judgment call involved.
 */
export function checkAvoidTerms(
  text: string,
  avoidTerms: string[]
): { blocked: boolean; matchedTerms: string[] } {
  const lower = text.toLowerCase();
  const matchedTerms = avoidTerms.filter(
    (term) => term.trim().length > 0 && lower.includes(term.toLowerCase())
  );
  return { blocked: matchedTerms.length > 0, matchedTerms };
}

/** AC-17: an over-limit caption is flagged, never silently truncated. */
export function validateCaptionLength(
  platform: SocialPlatform,
  caption: string | null | undefined
): { valid: boolean; limit: number; length: number } {
  const limit = PLATFORM_CAPTION_LIMITS[platform];
  const length = caption?.length ?? 0;
  return { valid: length <= limit, limit, length };
}

/** Cryptographically random opaque id — used for OAuth `state` and similar single-use tokens. */
export function randomOpaqueId(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
