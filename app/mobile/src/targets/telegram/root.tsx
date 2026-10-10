import { useCallback, useEffect, useRef, useState } from "react";
import { TargetRoot as AppRoot } from "../app/root";
import { onAuthChange } from "../../lib/firebaseAuth";
import { BootScreen, type BootState } from "./BootScreen";
import { signInWithTelegram, TelegramSignInError } from "./boot";
import { prepareTelegramChrome, routeExternalLinks, useTelegramBackButton } from "./shell";
import { isInTelegram, loadTelegramWebApp, type TelegramWebApp } from "./webApp";

type Phase = BootState | { kind: "ready"; app: TelegramWebApp };

/**
 * The Telegram Mini App: load Telegram's script, sign in with the launch's
 * signed initData, then render the full app (the app target's root; duels are
 * off through targetConfig.features). Outside Telegram, on a failed sign-in,
 * or after Sign out, the Telegram boot screen shows instead, never the app's
 * own Sign In screen.
 */
export function TargetRoot() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const attempt = useRef(0);

  const boot = useCallback(async () => {
    const run = ++attempt.current;
    const current = () => run === attempt.current;
    setPhase({ kind: "loading" });
    const app = await loadTelegramWebApp();
    if (!current()) return;
    if (!isInTelegram(app)) {
      setPhase({ kind: "outside" });
      return;
    }
    prepareTelegramChrome(app);
    try {
      await signInWithTelegram(app.initData);
      if (current()) setPhase({ kind: "ready", app });
    } catch (err) {
      if (!current()) return;
      const message = err instanceof TelegramSignInError ? err.message : "Couldn't sign you in. Try again.";
      setPhase({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void boot();
    const runs = attempt;
    return () => {
      // A strict-mode remount or unmount: drop whatever the old run resolves to.
      runs.current++;
    };
  }, [boot]);

  const ready = phase.kind === "ready";
  // Signed in, then signed out (Settings): back to the Telegram boot screen.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    let unsub = () => {};
    void onAuthChange((user) => {
      if (live && user === null) setPhase({ kind: "signedOut" });
    }).then((u) => {
      if (live) unsub = u;
      else u();
    });
    return () => {
      live = false;
      unsub();
    };
  }, [ready]);

  if (phase.kind !== "ready") return <BootScreen state={phase} onRetry={() => void boot()} />;
  return <TelegramApp app={phase.app} />;
}

/** The app inside Telegram's chrome: BackButton and external links wired to Telegram. */
function TelegramApp({ app }: { app: TelegramWebApp }) {
  useTelegramBackButton(app);
  useEffect(() => routeExternalLinks(app), [app]);
  return <AppRoot />;
}
