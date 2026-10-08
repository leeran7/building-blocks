/**
 * Telegram sign-in: post the launch's signed initData to the server, which
 * verifies it with the bot token and answers with a Firebase custom token for
 * the account telegram:<id>; signing in with it makes every API call
 * authenticated as that player.
 */

import { apiUrl } from "../../lib/api";
import { signInWithCustomToken } from "../../lib/firebaseAuth";

/** A sign-in that failed, with the line to show on the boot screen. */
export class TelegramSignInError extends Error {
  constructor(
    message: string,
    /** The server's code (INVALID_INIT_DATA, RATE_LIMITED, ...), or null for a network or client failure. */
    public readonly code: string | null,
  ) {
    super(message);
    this.name = "TelegramSignInError";
  }
}

const GENERIC = "Couldn't sign you in. Check your connection and try again.";

/** Exchange initData for a Firebase session. Throws TelegramSignInError. */
export async function signInWithTelegram(initData: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/auth/telegram"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
  } catch {
    throw new TelegramSignInError(GENERIC, null);
  }
  const body = (await res.json().catch(() => null)) as { customToken?: unknown; error?: unknown; code?: unknown } | null;
  if (!res.ok) {
    throw new TelegramSignInError(
      typeof body?.error === "string" ? body.error : GENERIC,
      typeof body?.code === "string" ? body.code : null,
    );
  }
  if (typeof body?.customToken !== "string" || body.customToken === "") throw new TelegramSignInError(GENERIC, null);
  try {
    await signInWithCustomToken(body.customToken);
  } catch {
    throw new TelegramSignInError(GENERIC, null);
  }
}
