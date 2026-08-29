/**
 * GET /api/social/accounts/oauth/:platform/callback — OAuth redirect target
 * (§4.2). Auth: none — trust is established entirely by the server-issued,
 * single-use `state` value (AC-6/AC-7). An invalid/expired/mismatched
 * state creates or updates NOTHING and redirects to an error page.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../../../../src/lib/rateLimit";
import { safeSocialAdminRedirect } from "../../../../../../../src/api/social/routeHelpers";
import { verifyAndConsumeOAuthState } from "../../../../../../../src/social/oauth/oauthState";
import { getProvider } from "../../../../../../../src/social/providers/registry";
import { upsertSocialAccount } from "../../../../../../../src/db/social/socialAccounts";
import { writeAuditLog } from "../../../../../../../src/db/social/auditLog";
import { SOCIAL_PLATFORMS } from "../../../../../../../src/social/types";
import type { SocialPlatform } from "../../../../../../../src/social/types";

export const runtime = "nodejs";

const ERROR_REDIRECT = "/admin/social/settings?connect_error=1";

function parsePlatform(raw: string): SocialPlatform | null {
  const upper = raw.toUpperCase();
  return (SOCIAL_PLATFORMS as string[]).includes(upper) ? (upper as SocialPlatform) : null;
}

function redirectUriFor(platform: SocialPlatform): string {
  const envName = `${platform}_REDIRECT_URI`;
  const value = process.env[envName];
  if (!value) throw new Error(`${envName} is not configured`);
  return value;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } }
): Promise<NextResponse> {
  const base = request.nextUrl.origin;
  const platform = parsePlatform(params.platform);
  if (!platform) return NextResponse.redirect(new URL(ERROR_REDIRECT, base));

  const rl = await checkRateLimit({
    namespace: "social:oauth:callback",
    identifier: clientIp(request),
    max: 20,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (!rl.allowed) return NextResponse.redirect(new URL(ERROR_REDIRECT, base));

  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  if (!code || !stateParam) return NextResponse.redirect(new URL(ERROR_REDIRECT, base));

  const verified = await verifyAndConsumeOAuthState(stateParam, platform);
  if (!verified.valid || !verified.initiatedByUid) {
    return NextResponse.redirect(new URL(ERROR_REDIRECT, base));
  }

  try {
    const provider = getProvider(platform);
    // X's OAuth2 PKCE flow uses the original `state` as the code_verifier (see xProvider.ts).
    const tokenResult = await provider.exchangeCodeForTokens(code, redirectUriFor(platform), stateParam);
    if (!tokenResult.ok) {
      console.error(`[social-oauth-callback] ${platform} token exchange failed: ${tokenResult.detail}`);
      return NextResponse.redirect(new URL(ERROR_REDIRECT, base));
    }

    const profileResult = await provider.getProfile(tokenResult.data.accessToken);
    if (!profileResult.ok) {
      console.error(`[social-oauth-callback] ${platform} profile fetch failed: ${profileResult.detail}`);
      return NextResponse.redirect(new URL(ERROR_REDIRECT, base));
    }

    const account = await upsertSocialAccount({
      platform,
      externalAccountId: profileResult.data.externalAccountId,
      handle: profileResult.data.handle,
      displayName: profileResult.data.displayName,
      avatarUrl: profileResult.data.avatarUrl,
      tokens: tokenResult.data,
      connectedByUid: verified.initiatedByUid,
    });

    await writeAuditLog({
      action: "CONNECT_ACCOUNT",
      result: "SUCCESS",
      initiator: verified.initiatedByUid,
      platform,
      socialAccountId: account.id,
    });

    const redirectAfter = safeSocialAdminRedirect(verified.redirectAfter);
    return NextResponse.redirect(new URL(redirectAfter, base));
  } catch (err) {
    console.error(`[social-oauth-callback] ${platform}`, err);
    await writeAuditLog({
      action: "CONNECT_ACCOUNT",
      result: "FAILURE",
      initiator: verified.initiatedByUid,
      platform,
      errorDetail: (err as Error).message,
    });
    return NextResponse.redirect(new URL(ERROR_REDIRECT, base));
  }
}
