/**
 * Discord Activity sign-in, server side (POST /api/auth/discord).
 *
 * The Embedded App SDK's `authorize` gives the Activity a one-time OAuth code.
 * The server exchanges it at Discord's fixed token URL with the client secret,
 * then asks Discord who the token belongs to. The Discord user id used for the
 * account comes ONLY from that /users/@me response, never from the request.
 *
 * Every URL here is a constant. Nothing about the outbound calls (host, path,
 * redirect_uri) is derived from the request, so the client secret and the
 * user's access token can only ever go to discord.com.
 *
 * Server-only (reads secrets from the environment).
 */

import { platformUid } from "../lib/platformAuth";

export const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
export const DISCORD_ME_URL = "https://discord.com/api/users/@me";

/** How long one call to Discord may take before the sign-in gives up. */
export const DISCORD_TIMEOUT_MS = 8_000;

/** Discord OAuth codes are short alphanumeric strings; anything else is refused unseen. */
const AUTH_CODE = /^[A-Za-z0-9]{1,128}$/;

export interface DiscordOAuthEnv {
  clientId: string;
  clientSecret: string;
}

/** DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET, or null when either is unset. */
export function discordOAuthEnv(env: NodeJS.ProcessEnv = process.env): DiscordOAuthEnv | null {
  const clientId = env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** The `code` field of the request body, or null when it is missing or malformed. */
export function parseAuthCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" && AUTH_CODE.test(code) ? code : null;
}

/**
 * Why a login failed:
 *  - CODE_REJECTED: Discord refused the code (expired, reused, other app).
 *  - DISCORD_UNAVAILABLE: Discord errored, timed out or answered nonsense.
 *  - BAD_USER: /users/@me answered without a well-formed user id.
 */
export type DiscordLoginFailure = "CODE_REJECTED" | "DISCORD_UNAVAILABLE" | "BAD_USER";

export type DiscordLogin =
  | { ok: true; discordUserId: string; accessToken: string }
  | { ok: false; failure: DiscordLoginFailure; status: number | null };

type FetchLike = typeof fetch;

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** The bearer access token from a token response, or null when it is not one. */
function accessTokenOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { access_token: token, token_type: type } = body as { access_token?: unknown; token_type?: unknown };
  if (typeof token !== "string" || token.length === 0) return null;
  if (typeof type !== "string" || type.toLowerCase() !== "bearer") return null;
  return token;
}

/**
 * Exchange an Activity auth code and identify its Discord user. Never throws:
 * a network error or timeout is DISCORD_UNAVAILABLE.
 */
export async function verifyDiscordLogin(
  code: string,
  env: DiscordOAuthEnv,
  fetchImpl: FetchLike = fetch
): Promise<DiscordLogin> {
  let tokenRes: Response;
  try {
    tokenRes = await fetchImpl(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        grant_type: "authorization_code",
        code,
      }).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: "DISCORD_UNAVAILABLE", status: null };
  }
  if (!tokenRes.ok) {
    // 400/401 is Discord saying no to this code (invalid_grant); anything else is Discord's trouble.
    const rejected = tokenRes.status === 400 || tokenRes.status === 401;
    return { ok: false, failure: rejected ? "CODE_REJECTED" : "DISCORD_UNAVAILABLE", status: tokenRes.status };
  }
  const accessToken = accessTokenOf(await readJson(tokenRes));
  if (!accessToken) return { ok: false, failure: "DISCORD_UNAVAILABLE", status: tokenRes.status };

  let meRes: Response;
  try {
    meRes = await fetchImpl(DISCORD_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: "DISCORD_UNAVAILABLE", status: null };
  }
  if (!meRes.ok) return { ok: false, failure: "DISCORD_UNAVAILABLE", status: meRes.status };
  const me = await readJson(meRes);
  const id = typeof me === "object" && me !== null ? (me as { id?: unknown }).id : undefined;
  if (platformUid("discord", id) === null) return { ok: false, failure: "BAD_USER", status: meRes.status };
  return { ok: true, discordUserId: id as string, accessToken };
}
