/**
 * Shared HTTP plumbing for the /api/levels routes: structured errors, the
 * signed-in player, and the LevelError → status map. Server-only.
 */

import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireAuth } from "../lib/requireAuth";
import type { LevelError, LevelErrorCode } from "../db/levels";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function reject(
  status: number,
  code: string,
  error: string,
  details: Record<string, string | number | null> = {}
): NextResponse {
  return NextResponse.json({ ...details, error, code }, { status, headers: NO_STORE });
}

export interface LevelPlayer {
  uid: string;
  email: string;
  emailVerified: boolean;
}

/**
 * The signed-in player, or a 401. Levels need a users row (lives, XP), so an
 * anonymous Firebase session, which has no email, is refused like no token.
 * Guests play locally and nothing about them is trusted (design §7).
 */
export async function levelPlayer(request: NextRequest): Promise<LevelPlayer | NextResponse> {
  let decoded: Awaited<ReturnType<typeof requireAuth>>;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    throw err;
  }
  if (!decoded.email) return reject(401, "UNAUTHORIZED", "Sign in to play levels");
  return { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified ?? false };
}

const LEVEL_ERROR_STATUS: Record<LevelErrorCode, number> = {
  USER_NOT_FOUND: 404,
  LEVEL_LOCKED: 403,
  OUT_OF_LIVES: 409,
  TICKET_NOT_FOUND: 404,
  TICKET_USED: 409,
  TICKET_EXPIRED: 410,
  IMPLAUSIBLE_RUN: 400,
};

export function levelErrorResponse(err: LevelError): NextResponse {
  return reject(LEVEL_ERROR_STATUS[err.code], err.code, err.message, err.details);
}

/** A season number: a positive integer small enough to be a real id. */
export function parseSeasonId(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : null;
}

/** Ticket ids are nanoid()s: URL-safe, 21 characters. */
export function parseTicketId(raw: unknown): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{10,64}$/.test(raw) ? raw : null;
}

export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
