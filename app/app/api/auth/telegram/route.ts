/**
 * POST /api/auth/telegram { initData } — sign in from the Telegram Mini App.
 *
 * `initData` is the raw `Telegram.WebApp.initData` string. It is verified with
 * the bot token (src/api/telegramInitData.ts: HMAC, constant-time compare,
 * 24h freshness), then the signed Telegram user becomes the Doomstack account
 * `telegram:<id>` and gets a Firebase custom token. The client signs in with
 * it, so every other route's Firebase auth works unchanged.
 *
 * 200 { customToken }
 * 400 BAD_REQUEST          the body is not JSON
 * 401 INVALID_INIT_DATA    initData missing, forged, stale or without a user
 * 429 RATE_LIMITED         per client IP; fails closed when Redis is down
 * 503 NOT_CONFIGURED       TELEGRAM_BOT_TOKEN is not set
 *
 * No auth header: this is how a Telegram player gets one.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { signInPlatformUser } from "../../../../src/lib/platformAuth";
import { telegramBotToken } from "../../../../src/api/telegramBot";
import { verifyTelegramInitData } from "../../../../src/api/telegramInitData";

export const runtime = "nodejs";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);
  const rl = await checkRateLimit({
    namespace: "auth:telegram",
    identifier: ip,
    max: RATE_LIMIT_MAX,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

  const botToken = telegramBotToken();
  if (botToken === null) {
    console.error(JSON.stringify({ type: "telegram_auth_unconfigured", missing: "TELEGRAM_BOT_TOKEN" }));
    return NextResponse.json({ error: "Telegram sign-in is not available", code: "NOT_CONFIGURED" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const initData = typeof body === "object" && body !== null ? (body as { initData?: unknown }).initData : undefined;

  const check = verifyTelegramInitData(initData, botToken, Math.floor(Date.now() / 1000));
  if (!check.ok) {
    console.warn(JSON.stringify({ type: "telegram_auth_refused", refusal: check.refusal, ip }));
    return NextResponse.json(
      { error: "Couldn't verify your Telegram sign-in. Reopen the game from Telegram.", code: "INVALID_INIT_DATA" },
      { status: 401 }
    );
  }

  try {
    const { uid, customToken } = await signInPlatformUser("telegram", check.telegramUserId);
    console.log(JSON.stringify({ type: "telegram_auth", uid, timestamp: new Date().toISOString() }));
    return NextResponse.json({ customToken });
  } catch (err) {
    console.error("[POST /api/auth/telegram]", err);
    return NextResponse.json({ error: "Couldn't sign you in. Please try again.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
