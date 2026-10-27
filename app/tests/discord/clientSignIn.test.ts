/**
 * The Discord Activity's client sign-in (mobile/src/targets/discord/signIn.ts)
 * against a fake Embedded App SDK, server and Firebase.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_SCOPES,
  READY_TIMEOUT_MS,
  signInWithDiscord,
  type SignInDeps,
  type SignInSdk,
} from "../../mobile/src/targets/discord/signIn";

const CLIENT_ID = "1290000000000000000";

function fakes(over: { ready?: () => Promise<void>; authorize?: SignInSdk["commands"]["authorize"]; res?: Response } = {}) {
  const log: string[] = [];
  const authenticate = vi.fn(async (args: { access_token?: string | null }) => {
    log.push(`authenticate:${args.access_token}`);
    return {} as Awaited<ReturnType<SignInSdk["commands"]["authenticate"]>>;
  });
  const authorize = vi.fn(
    over.authorize ??
      (async () => {
        log.push("authorize");
        return { code: "the-code" };
      })
  );
  const sdk: SignInSdk = {
    ready: over.ready ?? (async () => void log.push("ready")),
    commands: { authorize, authenticate },
  };
  const deps: SignInDeps = {
    sdk,
    clientId: CLIENT_ID,
    postCode: vi.fn(async (code: string) => {
      log.push(`post:${code}`);
      return over.res ?? Response.json({ customToken: "ct", accessToken: "at" });
    }),
    signInWithCustomToken: vi.fn(async (t: string) => void log.push(`firebase:${t}`)),
  };
  return { deps, log, authorize, authenticate };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("signInWithDiscord", () => {
  it("runs ready, authorize, the server exchange, authenticate and the Firebase sign-in in order", async () => {
    const f = fakes();
    expect(await signInWithDiscord(f.deps)).toEqual({ ok: true });
    expect(f.log).toEqual(["ready", "authorize", "post:the-code", "authenticate:at", "firebase:ct"]);
    expect(f.authorize).toHaveBeenCalledWith({
      client_id: CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [...DISCORD_SCOPES],
    });
    expect(DISCORD_SCOPES).toEqual(["identify", "applications.commands"]);
  });

  it("reports declined when the player closes the consent modal", async () => {
    const f = fakes({ authorize: async () => Promise.reject(new Error("User closed the modal")) });
    expect(await signInWithDiscord(f.deps)).toEqual({ ok: false, failure: "declined" });
    expect(f.deps.postCode).not.toHaveBeenCalled();
  });

  it("reports server when our route refuses, and never signs in", async () => {
    const f = fakes({ res: Response.json({ error: "no", code: "CODE_REJECTED" }, { status: 401 }) });
    expect(await signInWithDiscord(f.deps)).toEqual({ ok: false, failure: "server" });
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(f.deps.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("reports server when a 200 lacks the tokens", async () => {
    const f = fakes({ res: Response.json({ customToken: "ct" }) });
    expect(await signInWithDiscord(f.deps)).toEqual({ ok: false, failure: "server" });
    expect(f.deps.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("reports network when the request fails", async () => {
    const f = fakes();
    vi.mocked(f.deps.postCode).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await signInWithDiscord(f.deps)).toEqual({ ok: false, failure: "network" });
  });

  it("gives up with discord when the handshake never completes", async () => {
    vi.useFakeTimers();
    const f = fakes({ ready: () => new Promise<void>(() => {}) });
    const pending = signInWithDiscord(f.deps);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ ok: false, failure: "discord" });
    expect(f.authorize).not.toHaveBeenCalled();
  });
});
