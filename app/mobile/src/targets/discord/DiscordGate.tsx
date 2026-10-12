import type { ReactNode } from "react";
import { LogoLockup } from "../../components/LogoMark";
import { Button } from "../../components/ui";
import type { SignInFailure } from "./signIn";

/** Why the Activity is not showing the game. */
export type GateReason = "outside" | "signed-out" | SignInFailure;

const SITE = "https://www.doomstack.lol";

const COPY: Record<GateReason, { eyebrow: string; title: string; body: string; action: string | null }> = {
  outside: {
    eyebrow: "discord activity",
    title: "Open in Discord",
    body: "This version of Doomstack runs inside Discord. Start it from the Activities button in a voice channel or DM.",
    action: null,
  },
  declined: {
    eyebrow: "sign in",
    title: "Climb with Discord",
    body: "Doomstack uses your Discord account to save your climbs, gems and duels.",
    action: "Sign in with Discord",
  },
  "signed-out": {
    eyebrow: "signed out",
    title: "Climb with Discord",
    body: "Sign back in with your Discord account to pick up where you left off.",
    action: "Sign in with Discord",
  },
  discord: {
    eyebrow: "connection",
    title: "Discord didn't answer",
    body: "Doomstack couldn't reach the Discord app. Try again, or close and relaunch the Activity.",
    action: "Try again",
  },
  server: {
    eyebrow: "connection",
    title: "Couldn't sign you in",
    body: "Something went wrong on our side. Try again in a moment.",
    action: "Try again",
  },
  network: {
    eyebrow: "connection",
    title: "Couldn't sign you in",
    body: "Check your connection and try again.",
    action: "Try again",
  },
};

/** Full-frame column used by both gate states; works in Discord's landscape and portrait frames. */
function GateFrame({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <main
      aria-busy={busy || undefined}
      className="flex h-[100dvh] w-full flex-col items-center justify-center gap-8 overflow-y-auto bg-void px-8 py-[max(1.5rem,env(safe-area-inset-top))] text-center"
    >
      {children}
    </main>
  );
}

/** Shown while the SDK handshake and sign-in run. */
export function DiscordConnecting() {
  return (
    <GateFrame busy>
      <h1 className="m-0">
        <LogoLockup className="h-28 w-auto max-h-[30dvh]" />
      </h1>
      <p role="status" className="font-mono text-label uppercase tracking-label text-text-secondary">
        Connecting to Discord…
      </p>
    </GateFrame>
  );
}

/**
 * The Activity's own sign-in / retry screen. Never the app's Apple / Google
 * Sign In: inside Discord the only account is the Discord one.
 */
export function DiscordGate({ reason, busy, onRetry }: { reason: GateReason; busy: boolean; onRetry: () => void }) {
  const copy = COPY[reason];
  return (
    <GateFrame>
      <LogoLockup className="h-28 w-auto max-h-[30dvh]" />
      <div className="flex max-w-sm flex-col items-center gap-3">
        <span className="font-mono text-label uppercase tracking-eyebrow text-text-muted">{copy.eyebrow}</span>
        <h1 className="m-0 font-display text-title font-black uppercase tracking-tight text-text-primary">{copy.title}</h1>
        <p role={reason === "outside" ? undefined : "alert"} className="m-0 text-body text-text-secondary">
          {copy.body}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {copy.action ? (
          <Button onPress={onRetry} busy={busy}>
            {copy.action}
          </Button>
        ) : (
          <a
            href={SITE}
            className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-border-strong px-6 font-display text-meta uppercase tracking-wide text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            Play on doomstack.lol
          </a>
        )}
      </div>
    </GateFrame>
  );
}
