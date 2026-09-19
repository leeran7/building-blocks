import { openExternal } from "../lib/external";
import { tapLight } from "../lib/haptics";

export function LeaderboardConsentModal({
  onAccept,
  onDecline,
  busy,
}: {
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-void/60 backdrop-blur-sm">
      <div className="lcm-card w-full rounded-t-3xl border-t border-border-strong bg-surface/95 px-6 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-3 backdrop-blur-xl">
        <span aria-hidden className="mx-auto mb-5 block h-1 w-9 rounded-full bg-border-strong" />

        <h2 className="text-center font-display text-xl font-black uppercase tracking-tight text-text-primary">
          Post to leaderboard?
        </h2>
        <p className="mt-3 text-center text-sm leading-relaxed text-text-secondary">
          Your display name and peak height will appear on the public
          leaderboard, visible to all players.
        </p>
        <button
          type="button"
          onClick={() => {
            void tapLight();
            void openExternal("https://www.doomstack.lol/privacy");
          }}
          className="mt-2 block w-full text-center font-mono text-[11px] uppercase tracking-[0.15em] text-signal underline underline-offset-2"
        >
          View Privacy Policy
        </button>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onAccept}
            disabled={busy}
            className="min-h-[52px] rounded-full bg-signal font-display text-base font-black uppercase tracking-widest text-void shadow-signal transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save my score"}
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            className="min-h-[52px] rounded-full border border-border-strong bg-surface-raised font-display text-sm font-bold uppercase tracking-widest text-text-primary transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
          >
            Not now
          </button>
        </div>

        <style>{`
          .lcm-card {
            animation: lcmUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes lcmUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .lcm-card { animation: none; }
          }
        `}</style>
      </div>
    </div>
  );
}
