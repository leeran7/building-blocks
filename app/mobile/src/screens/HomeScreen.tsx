import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tapLight, tapHeavy } from "../lib/haptics";
import { apiFetch, API_BASE } from "../lib/api";
import { shareInvite } from "@app/lib/shareInvite";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { LogoMark } from "../components/LogoMark";
import { useHubPrefetch } from "../contexts/AppDataContext";
import { dailySummary, msUntilReset, formatReset, type DailySummary } from "../lib/daily";
import { useMatchmakingQueue } from "../hooks/useMatchmakingQueue";

/**
 * Home = the game title screen. Play-first and hub-centric: a dominant, molten
 * PLAY button drops straight into a fresh random climb (no level select), with
 * the player's live standing underneath and the secondary destinations as
 * HUD-style icon buttons. Deliberately NOT a bottom-tab content layout — this
 * reads as a game main menu.
 */
export function HomeScreen() {
  const navigate = useNavigate();

  // Warm the shared cache from the landing screen so Profile / Ranks are instant
  // on first visit; the returned dashboard slice also feeds the standing line,
  // deduping what used to be a separate Home /api/dashboard fetch.
  const standing = useHubPrefetch().data?.freeClimb ?? null;

  // Daily challenge state — refreshes each time Home mounts (after a run) and
  // the reset countdown re-renders on a slow tick.
  const [daily, setDaily] = useState<DailySummary>(() => dailySummary());
  const [resetMs, setResetMs] = useState<number>(() => msUntilReset());
  useEffect(() => {
    // Recompute the whole summary (not just the countdown) so the card doesn't
    // show a stale streak / "resets in" across a local-midnight rollover while
    // the app sits foregrounded, and refresh on return-to-foreground.
    const refresh = () => {
      setDaily(dailySummary());
      setResetMs(msUntilReset());
    };
    refresh();
    const id = window.setInterval(refresh, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const play = () => {
    void tapHeavy();
    navigate("/climb");
  };

  const playDaily = () => {
    void tapHeavy();
    navigate("/climb?daily=1");
  };

  // Challenge = create a private 1v1 race on a server-seeded tower, hand the
  // invite link to the OS share sheet, then drop into the native race room to
  // wait for the friend. A shared https link opens straight into this room on
  // devices that have the app (universal/app links) and the web otherwise.
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const startChallenge = useCallback(async () => {
    if (challengeBusy) return;
    void tapLight();
    setChallengeBusy(true);
    setChallengeError(null);
    try {
      const res = await apiFetch("/api/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: "tech" }),
      });
      // 409 = this user already has an open challenge; reuse it rather than
      // orphaning a second row.
      if (res.status === 409) {
        const body = (await res.json()) as { existingId: string };
        await shareInvite(`${API_BASE}/duel/${body.existingId}`).catch(() => {});
        navigate(`/duel/${body.existingId}`);
        return;
      }
      // 429 = rate limited. Don't frame this as "tap to retry" — hammering the
      // button just burns more budget and deepens the cooldown.
      if (res.status === 429) {
        setChallengeError("Too many challenges — give it a minute");
        return;
      }
      if (!res.ok) {
        setChallengeError("Couldn't start — tap to retry");
        return;
      }
      const body = (await res.json()) as { id: string };
      // Build the invite from the app's canonical origin rather than the
      // server-returned `link`: the server derives that from BASE_URL, which is
      // localhost in dev/unset envs and would not deep-link. A canonical
      // https://<host>/duel/:id is what the universal/app links verify.
      await shareInvite(`${API_BASE}/duel/${body.id}`).catch(() => {});
      navigate(`/duel/${body.id}`);
    } catch {
      setChallengeError("Couldn't start — tap to retry");
    } finally {
      setChallengeBusy(false);
    }
  }, [challengeBusy, navigate]);

  // Quick Play = random matchmaking queue. The hook encapsulates POST (join),
  // GET polling, DELETE (cancel), and cleanup on unmount.
  const queue = useMatchmakingQueue();

  // Navigate to the duel room as soon as a match is found.
  useEffect(() => {
    if (queue.state.status === "matched" && queue.state.duelId) {
      navigate(`/duel/${queue.state.duelId}`);
    }
  }, [queue.state.status, queue.state.duelId, navigate]);

  const queueActive = queue.state.status !== "idle";

  return (
    <main className="flex h-full flex-col pt-[calc(env(safe-area-inset-top)+3.5rem)]">
      {/* Game content — flex-1 keeps BottomNav pinned at the bottom */}
      <div className="flex flex-1 flex-col items-center justify-center gap-9 px-6 text-center">
        {/* Wordmark */}
        <div className="mt-1 flex flex-col items-center gap-2">
          <LogoMark size={48} card className="mb-1" />
          <span className="font-mono text-[11px] uppercase tracking-[0.5em] text-text-muted">
            endless&nbsp;climb
          </span>
          <h1 className="hm-wordmark font-display text-[2.75rem] font-black uppercase leading-none tracking-tight text-text-primary">
            Doom<span className="text-signal">stack</span>
          </h1>
          <span className="h-px w-16 bg-border-strong" />
          <StandingLine standing={standing} />
        </div>

        {/* PLAY = filled-signal hero (the one primary action) + secondary modes */}
        <div className="flex w-full flex-col items-center gap-3">
          <button
            onClick={play}
            aria-label="Play"
            className="flex w-full items-center gap-4 rounded-2xl bg-signal px-5 py-5 text-left text-void shadow-signal transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-void/15">
              <PlayGlyph />
            </span>
            <span className="flex-1">
              <span className="block font-display text-2xl font-black uppercase tracking-wide text-void">
                Play
              </span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-void/70">
                Endless quick climb
              </span>
            </span>
            <ChevronRight className="text-void/60" />
          </button>

          <div className="flex w-full flex-col gap-2.5">
            <DailyCard daily={daily} resetMs={resetMs} onPress={playDaily} />
            <QuickPlayCard onPress={queue.join} />
            <ChallengeCard
              busy={challengeBusy}
              error={challengeError}
              onPress={startChallenge}
            />
          </div>
        </div>
      </div>

      {/* Searching overlay — full-screen takeover while in the matchmaking queue */}
      {queueActive && (
        <SearchingOverlay
          status={queue.state.status}
          errorMessage={queue.state.errorMessage}
          onCancel={queue.cancel}
          onRetry={queue.join}
          onDismiss={queue.reset}
        />
      )}

      <style>{`
        .hm-wordmark {
          text-shadow: 0 0 34px rgba(203, 242, 77, 0.14);
        }
      `}</style>
    </main>
  );
}

function StandingLine({ standing }: { standing: { peakY: number; rank: number } | null }) {
  if (standing) {
    return (
      <p
        aria-live="polite"
        className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary"
      >
        <span>
          Best{" "}
          <span className="tabular-nums text-text-primary">
            {standing.peakY.toLocaleString()}{ALTITUDE_UNIT}
          </span>
        </span>
        <span className="h-1 w-1 rounded-full bg-border-strong" />
        <span className="tabular-nums text-signal">#{standing.rank}</span>
      </p>
    );
  }
  // No climbs yet (or still loading).
  return (
    <p
      aria-live="polite"
      className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary"
    >
      Your first climb awaits
    </p>
  );
}

/**
 * Generic game-mode row on the home hub. Every secondary mode (Daily Climb now;
 * 1v1 Duel later) renders through this one card so they share an identical
 * language — a tinted icon chip, title + optional badge, subtitle, and a
 * trailing affordance. Adding a mode is a single <ModeCard/> with no new layout.
 */
type ModeTint = "ember" | "signal";

function ModeCard({
  icon,
  tint,
  title,
  subtitle,
  badge,
  trailing,
  onPress,
  ariaLabel,
}: {
  icon: React.ReactNode;
  tint: ModeTint;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress: () => void;
  ariaLabel?: string;
}) {
  const chip =
    tint === "ember"
      ? "border-ember/40 bg-ember/10"
      : "border-signal/40 bg-signal/10";
  return (
    <button
      onClick={onPress}
      aria-label={ariaLabel ?? title}
      className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3.5 text-left transition-transform active:scale-[0.98]"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${chip}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display text-sm font-black uppercase tracking-wide text-text-primary">
            {title}
          </span>
          {badge}
        </span>
        <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary leading-snug whitespace-pre-line">
          {subtitle}
        </span>
      </span>
      {trailing ?? <ChevronRight />}
    </button>
  );
}

function DailyCard({
  daily,
  resetMs,
  onPress,
}: {
  daily: DailySummary;
  resetMs: number;
  onPress: () => void;
}) {
  const sub = daily.playedToday
    ? `Today ${daily.todayBest.toLocaleString()}${ALTITUDE_UNIT}\nMap changes ${formatReset(resetMs)}`
    : `Same tower for everyone\nMap changes ${formatReset(resetMs)}`;
  return (
    <ModeCard
      icon={<FlameIcon />}
      tint="ember"
      title="Daily Climb"
      subtitle={sub}
      ariaLabel="Play the daily climb"
      badge={
        daily.streak > 0 ? (
          <span className="rounded-full bg-ember/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-ember">
            {daily.streak}🔥
          </span>
        ) : undefined
      }
      trailing={undefined}
      onPress={onPress}
    />
  );
}

function PlayGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-ember" aria-hidden>
      <path d="M12 2c.5 3-1.5 4.5-3 6.5C7.4 10.6 6.5 12.3 6.5 14a5.5 5.5 0 0 0 11 0c0-1.7-.8-3.2-2-4.5-.6 1-1.6 1.6-2.6 1.6 1-2 .3-4.4-1.4-6.1C11.6 5 12 3.4 12 2Z" />
    </svg>
  );
}

function ChevronRight({ className = "text-text-muted" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Challenge = create a private 1v1 race and share the invite link, then race a
 * friend on the same server-seeded tower in the native room. Deliberately NOT
 * ranked/1v1-arena — no matchmaking, stakes, or W/L in the app.
 */
function ChallengeCard({
  busy,
  error,
  onPress,
}: {
  busy: boolean;
  error: string | null;
  onPress: () => void;
}) {
  const subtitle = busy
    ? "Creating your challenge…"
    : error
      ? error
      : "Race a friend on the same tower";
  return (
    <ModeCard
      icon={<SwordsIcon />}
      tint="signal"
      title="Challenge"
      subtitle={subtitle}
      ariaLabel="Challenge a friend to a race"
      onPress={onPress}
    />
  );
}

function SwordsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-signal" aria-hidden>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="m5 14 4 4" />
      <path d="m7 17-2 2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-signal" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

/**
 * Quick Play = random 1v1 matchmaking. Tapping this joins the queue; the
 * SearchingOverlay takes over until a match is found or the player cancels.
 */
function QuickPlayCard({ onPress }: { onPress: () => void }) {
  return (
    <ModeCard
      icon={<BoltIcon />}
      tint="signal"
      title="Quick Play"
      subtitle="Find a random opponent"
      ariaLabel="Quick play -- find a random opponent"
      onPress={onPress}
    />
  );
}

/**
 * Full-screen overlay shown while the player is in the matchmaking queue.
 * Covers the home screen to prevent accidental navigation and reads as a
 * game loading / matchmaking screen.
 */
function SearchingOverlay({
  status,
  errorMessage,
  onCancel,
  onRetry,
  onDismiss,
}: {
  status: string;
  errorMessage: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void/95 px-6 text-center backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Matchmaking"
    >
      {/* Live region for screen readers */}
      <p className="sr-only" aria-live="assertive">
        {status === "joining" || status === "searching"
          ? "Searching for an opponent."
          : status === "timeout"
            ? "Search timed out. No opponent found."
            : status === "error" && errorMessage
              ? errorMessage
              : ""}
      </p>

      {(status === "joining" || status === "searching") && (
        <>
          <span
            className="mb-6 inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-border-strong border-t-signal"
            aria-hidden
          />
          <p className="font-display text-xl font-black uppercase tracking-wide text-text-primary">
            Searching for opponent
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-secondary">
            This usually takes a few seconds
          </p>
          <button
            onClick={onCancel}
            className="mt-10 min-h-[48px] rounded-full border border-border-strong px-8 py-3 font-display text-sm font-bold uppercase tracking-wide text-text-secondary transition-transform active:scale-[0.97]"
          >
            Cancel
          </button>
        </>
      )}

      {status === "timeout" && (
        <>
          <p className="font-display text-xl font-black uppercase tracking-wide text-text-primary">
            No opponent found
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-secondary">
            Try again or come back later
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={onRetry}
              className="min-h-[48px] w-full rounded-full bg-signal px-8 py-3 font-display text-sm font-black uppercase tracking-wide text-void shadow-signal transition-transform active:scale-[0.97]"
            >
              Search again
            </button>
            <button
              onClick={onDismiss}
              className="min-h-[48px] rounded-full border border-border-strong px-8 py-3 font-display text-sm font-bold uppercase tracking-wide text-text-secondary transition-transform active:scale-[0.97]"
            >
              Back
            </button>
          </div>
        </>
      )}

      {status === "error" && (
        <>
          <p className="font-display text-lg font-black uppercase tracking-wide text-ember">
            {errorMessage ?? "Something went wrong"}
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={onRetry}
              className="min-h-[48px] w-full rounded-full bg-signal px-8 py-3 font-display text-sm font-black uppercase tracking-wide text-void shadow-signal transition-transform active:scale-[0.97]"
            >
              Try again
            </button>
            <button
              onClick={onDismiss}
              className="min-h-[48px] rounded-full border border-border-strong px-8 py-3 font-display text-sm font-bold uppercase tracking-wide text-text-secondary transition-transform active:scale-[0.97]"
            >
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}

