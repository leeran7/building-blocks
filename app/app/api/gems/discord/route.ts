/**
 * POST /api/gems/discord — settle Discord gem-pack purchases.
 *
 * Takes no input: the request body is never read. The server lists the
 * signed-in Discord user's entitlements from Discord with the bot token,
 * credits each unconsumed gem-pack SKU once (idempotent on the entitlement
 * id) and then consumes it (src/api/discordEntitlements.ts). The Activity
 * calls this after `startPurchase` and once per launch, so a purchase whose
 * credit or consume was interrupted settles on the next call.
 *
 * 200 { gems, credited, duplicates }
 * 403 { code: NOT_DISCORD_ACCOUNT }   the signed-in account is not discord:<id>
 * 429 { code: RATE_LIMITED }
 * 502 { code: DISCORD_UNAVAILABLE }  the entitlements list could not be read
 * 503 { code: NOT_CONFIGURED }       DISCORD_CLIENT_ID / DISCORD_BOT_TOKEN / DISCORD_GEM_SKUS unset
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../src/lib/api/withAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import {
  DiscordApiError,
  discordGemsEnv,
  discordUserIdOf,
  settleDiscordGems,
} from "../../../../src/api/discordEntitlements";

export const runtime = "nodejs";

const RATE_MAX = 60;
const RATE_WINDOW_SECONDS = 3600;

export const POST = withAuth(async (_request: NextRequest, uid: string) => {
  const discordUserId = discordUserIdOf(uid);
  if (!discordUserId) {
    return NextResponse.json(
      { error: "Discord purchases need a Discord account", code: "NOT_DISCORD_ACCOUNT" },
      { status: 403 }
    );
  }

  const env = discordGemsEnv();
  if (!env) {
    console.error("[POST /api/gems/discord] DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN or DISCORD_GEM_SKUS is not set");
    return NextResponse.json({ error: "Discord purchases are not available", code: "NOT_CONFIGURED" }, { status: 503 });
  }

  const rl = await checkRateLimit({
    namespace: "gems:discord",
    identifier: uid,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

  try {
    const result = await settleDiscordGems(uid, discordUserId, env);
    return NextResponse.json({ gems: result.balance, credited: result.credited, duplicates: result.duplicates });
  } catch (err) {
    if (err instanceof DiscordApiError) {
      console.warn(JSON.stringify({ type: "discord_entitlements_failed", uid, discord_status: err.status }));
      return NextResponse.json(
        { error: "Couldn't reach Discord. Your purchase is safe; try again.", code: "DISCORD_UNAVAILABLE" },
        { status: 502 }
      );
    }
    console.error("[POST /api/gems/discord]", err);
    return NextResponse.json({ error: "Couldn't add your gems. Please try again.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
});
