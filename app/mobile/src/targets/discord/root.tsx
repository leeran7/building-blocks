// First import: patch fetch / XHR / WebSocket for Discord's proxy before any
// other module (Firebase, Ably, the app's patchFetch) captures them.
import "./urlMappings";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { apiUrl } from "../../lib/api";
import { onAuthChange, signInWithCustomToken } from "../../lib/firebaseAuth";
import { discordPayments } from "./config";
import { discordClientId } from "./env";
import { routeExternalLinks } from "./externalLinks";
import { discordSdk } from "./sdk";
import { signInWithDiscord } from "./signIn";
import { DiscordConnecting, DiscordGate, type GateReason } from "./DiscordGate";

/**
 * The full app, loaded only once the player is signed in, so its patchFetch
 * captures the proxy-patched fetch and no screen renders signed out.
 */
const AppRoot = lazy(() => import("../app/root").then((m) => ({ default: m.TargetRoot })));

/** How long the Shop waits for Discord's prices before showing web prices. */
const PRICE_WAIT_MS = 3_000;

type Phase = { kind: "connecting" } | { kind: "gate"; reason: GateReason } | { kind: "app" };

/** Sign in with Discord. Resolves to the phase to show next. */
async function boot(): Promise<Phase> {
  const sdk = discordSdk();
  const clientId = discordClientId();
  if (!sdk || !clientId) return { kind: "gate", reason: "outside" };

  const result = await signInWithDiscord({
    sdk,
    clientId,
    postCode: (code) =>
      fetch(apiUrl("/api/auth/discord"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }),
    signInWithCustomToken,
  });
  if (!result.ok) return { kind: "gate", reason: result.failure };

  routeExternalLinks(sdk);
  // Discord's prices before the Shop can render, but never hold the game for them.
  await Promise.race([discordPayments.loadPrices(), new Promise((r) => setTimeout(r, PRICE_WAIT_MS))]);
  // A purchase interrupted last time (closed mid-settle) is credited now.
  void discordPayments.settlePending();
  return { kind: "app" };
}

/** The Discord Activity: Discord sign-in, then the full app in a frame that fits Discord's layouts. */
export function TargetRoot() {
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });
  const [busy, setBusy] = useState(false);

  const run = useCallback(() => {
    setBusy(true);
    void boot().then((next) => {
      setPhase(next);
      setBusy(false);
    });
  }, []);

  useEffect(run, [run]);

  // Signing out in Settings drops back to the Discord gate, never the app's Sign In.
  useEffect(() => {
    if (phase.kind !== "app") return;
    let unsub = () => {};
    let cancelled = false;
    void onAuthChange((user) => {
      if (!user) setPhase({ kind: "gate", reason: "signed-out" });
    }).then((u) => {
      if (cancelled) u();
      else unsub = u;
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [phase.kind]);

  if (phase.kind === "connecting") return <DiscordConnecting />;
  if (phase.kind === "gate") return <DiscordGate reason={phase.reason} busy={busy} onRetry={run} />;
  return (
    // Landscape frames (desktop) get a centred portrait column; portrait
    // (mobile) frames fill the width. translateZ makes the column the
    // containing block for the app's fixed bars, so they stay inside it.
    <div className="flex h-[100dvh] w-full justify-center overflow-hidden bg-void">
      <div className="relative h-full w-full max-w-[max(430px,62.5dvh)] overflow-hidden [transform:translateZ(0)]">
        <Suspense fallback={<DiscordConnecting />}>
          <AppRoot />
        </Suspense>
      </div>
    </div>
  );
}
