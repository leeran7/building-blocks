/**
 * POST /api/auth/discord { code } — sign in from the Discord Activity.
 *
 * `code` is the one-time OAuth code from the Embedded App SDK's `authorize`.
 * The server exchanges it with Discord using its client secret, reads the
 * Discord user from /users/@me with the resulting token, provisions the
 * `discord:<id>` account and mints its Firebase custom token
 * (src/api/discordAuth.ts, src/lib/platformAuth.ts). The access token goes back
 * to the Activity, which needs it for the SDK's `authenticate` command.
 *
 * 200 { customToken, accessToken }
 * 400 { code: BAD_REQUEST }            no well-formed code in the body
 * 401 { code: CODE_REJECTED }          Discord refused the code
 * 429 { code: RATE_LIMITED }
 * 502 { code: DISCORD_UNAVAILABLE | BAD_USER }
 * 503 { code: NOT_CONFIGURED }         DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET unset
 *
 * No auth header (this is how the Activity gets one). Rate limited by client
 * IP before any outbound call, failing closed, then per Discord user.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { discordOAuthEnv, parseAuthCode, verifyDiscordLogin, type DiscordLoginFailure } from "../../../../src/api/discordAuth";
import { signInPlatformUser } from "../../../../src/lib/platformAuth";

export const runtime = "nodejs";

/**
 * Per client IP. Generous because Activity traffic reaches us through
 * Discord's proxy, so many players can share one forwarded address.
 */
const IP_MAX = 120;
const IP_WINDOW_SECONDS = 60;
/** Per verified Discord user: an Activity signs in once per launch. */
const USER_MAX = 20;
const USER_WINDOW_SECONDS = 600;

const FAILURES: Record<DiscordLoginFailure, { status: number; error: string }> = {
  CODE_REJECTED: { status: 401, error: "Discord didn't accept that sign-in. Try again." },
  DISCORD_UNAVAILABLE: { status: 502, error: "Couldn't reach Discord. Try again." },
  BAD_USER: { status: 502, error: "Discord didn't return your account. Try again." },
};

const tooMany = () => NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = discordOAuthEnv();
  if (!env) {
    console.error("[POST /api/auth/discord] DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not set");
    return NextResponse.json({ error: "Discord sign-in is not available", code: "NOT_CONFIGURED" }, { status: 503 });
  }

  const ip = await checkRateLimit({
    namespace: "auth:discord:ip",
    identifier: clientIp(request),
    max: IP_MAX,
    windowSeconds: IP_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!ip.allowed) return tooMany();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const code = parseAuthCode(body);
  if (!code) return NextResponse.json({ error: "Missing sign-in code", code: "BAD_REQUEST" }, { status: 400 });

  const login = await verifyDiscordLogin(code, env);
  if (!login.ok) {
    console.warn(
      JSON.stringify({ type: "discord_auth_refused", failure: login.failure, discord_status: login.status })
    );
    const { status, error } = FAILURES[login.failure];
    return NextResponse.json({ error, code: login.failure }, { status });
  }

  const user = await checkRateLimit({
    namespace: "auth:discord:user",
    identifier: login.discordUserId,
    max: USER_MAX,
    windowSeconds: USER_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!user.allowed) return tooMany();

  try {
    const { uid, customToken } = await signInPlatformUser("discord", login.discordUserId);
    console.log(JSON.stringify({ type: "discord_auth", uid, timestamp: new Date().toISOString() }));
    return NextResponse.json({ customToken, accessToken: login.accessToken });
  } catch (err) {
    console.error("[POST /api/auth/discord]", err);
    return NextResponse.json({ error: "Couldn't sign you in. Try again.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
