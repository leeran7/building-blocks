/**
 * GET  /api/settings — the signed-in user's display name + saved URLs.
 * PUT  /api/settings — update display name and/or the saved-URL list.
 *
 * Auth required (Firebase Bearer token). URLs are validated + sanitised the same
 * way as submissions before being stored.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { ensureUser } from "../../../src/db/user";
import { getUserSettings, updateUserSettings } from "../../../src/db/settings";
import { validateUrl } from "../../../src/lib/validateUrl";
import { checkRateLimit } from "../../../src/lib/rateLimit";

export const runtime = "nodejs";

const MAX_URLS = 25;
const MAX_NAME = 60;

// Per-user cap on settings writes. Fails OPEN so a Redis outage never blocks a
// legitimate save (UX path).
const SETTINGS_RATE_MAX = 30;
const SETTINGS_RATE_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getUserSettings(decoded.uid));
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit per verified UID. Fails OPEN (UX path) so a Redis outage never
  // blocks a legitimate settings save.
  const rl = await checkRateLimit({
    namespace: "settings",
    identifier: decoded.uid,
    max: SETTINGS_RATE_MAX,
    windowSeconds: SETTINGS_RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    console.warn(
      JSON.stringify({
        type: "rate_limit_hit",
        path: "/api/settings",
        uid: decoded.uid,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let body: { displayName?: unknown; urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { displayName?: string | null; urls?: string[] } = {};

  if (body.displayName !== undefined) {
    if (body.displayName !== null && typeof body.displayName !== "string") {
      return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
    }
    patch.displayName =
      typeof body.displayName === "string"
        ? body.displayName.slice(0, MAX_NAME)
        : null;
  }

  if (body.urls !== undefined) {
    if (!Array.isArray(body.urls)) {
      return NextResponse.json({ error: "urls must be an array" }, { status: 400 });
    }
    if (body.urls.length > MAX_URLS) {
      return NextResponse.json(
        { error: `At most ${MAX_URLS} URLs` },
        { status: 400 }
      );
    }
    const clean: string[] = [];
    for (const raw of body.urls) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const v = validateUrl(raw);
      if (!v.valid || !v.sanitised) {
        return NextResponse.json(
          { error: `Invalid URL: ${raw}` },
          { status: 400 }
        );
      }
      clean.push(v.sanitised);
    }
    patch.urls = clean;
  }

  try {
    // Provision the user row if needed (blocks/saved_urls FK to users(id)).
    if (decoded.email) {
      await ensureUser({
        id: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified ?? false,
      });
    }
    const settings = await updateUserSettings(decoded.uid, patch);
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[PUT /api/settings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
