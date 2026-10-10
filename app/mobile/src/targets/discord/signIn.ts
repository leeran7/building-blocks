/**
 * Discord Activity sign-in, client side:
 *
 *   ready() -> authorize (OAuth code) -> POST /api/auth/discord
 *     -> authenticate({ access_token }) -> Firebase signInWithCustomToken
 *
 * The server does the code exchange and decides who the user is
 * (app/api/auth/discord/route.ts); this only carries the code there and the
 * tokens back. Every step that can hang (Discord's handshake, the OAuth
 * modal, the network) is bounded so a failure always reaches the retry
 * screen instead of a spinner forever.
 */

import type { DiscordSDK } from "@discord/embedded-app-sdk";

/** Scopes the Activity asks for: who you are, and the Activity's own commands. */
export const DISCORD_SCOPES = ["identify", "applications.commands"] as const;

/** Discord's handshake with the client normally takes well under a second. */
export const READY_TIMEOUT_MS = 10_000;
/** The OAuth consent modal waits on the player; give them time to read it. */
export const AUTHORIZE_TIMEOUT_MS = 120_000;
/** Our server plus Discord's token exchange, or Firebase's sign-in. */
export const NETWORK_TIMEOUT_MS = 20_000;

/**
 * Why sign-in stopped. The root picks the retry screen's copy from this.
 *  - declined: the player closed the Discord consent modal.
 *  - discord: the Discord client did not answer (handshake or a command).
 *  - server: our sign-in route refused or failed.
 *  - network: a request did not complete.
 */
export type SignInFailure = "declined" | "discord" | "server" | "network";

export type SignInResult = { ok: true } | { ok: false; failure: SignInFailure };

/** The SDK surface sign-in uses (a fake in tests). */
export interface SignInSdk {
  ready: DiscordSDK["ready"];
  commands: Pick<DiscordSDK["commands"], "authorize" | "authenticate">;
}

export interface SignInDeps {
  sdk: SignInSdk;
  clientId: string;
  /** POST the code to /api/auth/discord. */
  postCode(code: string): Promise<Response>;
  /** Firebase sign-in with the server's custom token. */
  signInWithCustomToken(token: string): Promise<void>;
}

class StepError extends Error {
  constructor(public readonly failure: SignInFailure) {
    super(failure);
  }
}

/** `p`, or a StepError(failure) once `ms` have passed or when it rejects. */
async function step<T>(p: Promise<T>, ms: number, failure: SignInFailure): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepError(failure)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } catch (err) {
    throw err instanceof StepError ? err : new StepError(failure);
  } finally {
    clearTimeout(timer);
  }
}

/** The tokens from a 200 /api/auth/discord, or null when the body is not that shape. */
export function parseSignInResponse(v: unknown): { customToken: string; accessToken: string } | null {
  if (typeof v !== "object" || v === null) return null;
  const { customToken, accessToken } = v as { customToken?: unknown; accessToken?: unknown };
  if (typeof customToken !== "string" || customToken === "" || typeof accessToken !== "string" || accessToken === "") {
    return null;
  }
  return { customToken, accessToken };
}

/** Run the whole sign-in. Never throws. */
export async function signInWithDiscord(deps: SignInDeps): Promise<SignInResult> {
  try {
    await step(deps.sdk.ready(), READY_TIMEOUT_MS, "discord");
    const { code } = await step(
      deps.sdk.commands.authorize({
        client_id: deps.clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: [...DISCORD_SCOPES],
      }),
      AUTHORIZE_TIMEOUT_MS,
      "declined"
    );
    const res = await step(deps.postCode(code), NETWORK_TIMEOUT_MS, "network");
    if (!res.ok) return { ok: false, failure: "server" };
    const tokens = parseSignInResponse(await res.json().catch(() => null));
    if (!tokens) return { ok: false, failure: "server" };
    await step(deps.sdk.commands.authenticate({ access_token: tokens.accessToken }), NETWORK_TIMEOUT_MS, "discord");
    await step(deps.signInWithCustomToken(tokens.customToken), NETWORK_TIMEOUT_MS, "network");
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: err instanceof StepError ? err.failure : "network" };
  }
}
