import { LogoMark } from "../../components/LogoMark";
import { Button } from "../../components/ui";

export type BootState =
  /** Loading Telegram's script and signing in. */
  | { kind: "loading" }
  /** Opened outside Telegram, or the script was blocked. */
  | { kind: "outside" }
  /** Sign-in failed. */
  | { kind: "error"; message: string }
  /** Signed out from Settings. */
  | { kind: "signedOut" };

const COPY: Record<Exclude<BootState["kind"], "loading">, { title: string; action: string }> = {
  outside: { title: "Open in Telegram", action: "Try again" },
  error: { title: "Couldn't sign in", action: "Try again" },
  signedOut: { title: "Signed out", action: "Sign in with Telegram" },
};

function messageOf(state: Exclude<BootState, { kind: "loading" }>): string {
  if (state.kind === "error") return state.message;
  if (state.kind === "signedOut") return "Sign back in with your Telegram account to keep climbing.";
  return "Doomstack plays inside Telegram. Open it from the Doomstack bot's Play button.";
}

/**
 * The Telegram build's own first screen: the logo while signing in, then,
 * if that can't happen, what went wrong and one retry. Never the app's
 * Apple / Google Sign In: a Telegram player signs in with Telegram only.
 */
export function BootScreen({ state, onRetry }: { state: BootState; onRetry: () => void }) {
  return (
    <main
      data-telegram-boot={state.kind}
      className="flex h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-void px-8 text-center"
    >
      {state.kind === "loading" ? (
        <div role="status" aria-label="Signing in with Telegram" className="telegram-boot-mark">
          <LogoMark size={96} />
        </div>
      ) : (
        <>
          <LogoMark size={80} />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-title font-black uppercase tracking-tight text-text-primary">
              {COPY[state.kind].title}
            </h1>
            <p role="alert" className="max-w-[20rem] text-body leading-relaxed text-text-secondary">
              {messageOf(state)}
            </p>
          </div>
          <Button fullWidth={false} onPress={onRetry}>
            {COPY[state.kind].action}
          </Button>
        </>
      )}
      <style>{`
        .telegram-boot-mark { animation: telegramBootPulse 1.8s ease-in-out infinite; }
        @keyframes telegramBootPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.97); }
          50%      { opacity: 1;    transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .telegram-boot-mark { animation: none; opacity: 1; }
        }
      `}</style>
    </main>
  );
}
