import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tapHeavy } from "../lib/haptics";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { useHubPrefetch } from "../contexts/AppDataContext";
import { dailySummary, msUntilReset, formatReset, type DailySummary } from "../lib/daily";
import { useMatchmakingQueue } from "../hooks/useMatchmakingQueue";
import volcanoScene from "@app/../public/climb/volcano-tile.jpg";

/**
 * Home = the game title screen. Play-first and hub-centric: the wordmark and
 * the player's standing sit up top over the volcanic scene, and a dominant
 * PLAY button plus the secondary modes are anchored above the tab bar.
 */
export function HomeScreen() {
  const navigate = useNavigate();

  // Warm the shared cache from the landing screen so Profile / Ranks are instant
  // on first visit; the returned dashboard slice also feeds the Best card.
  const hub = useHubPrefetch();
  const standing = hub.data?.freeClimb ?? null;
  const standingLoading = hub.data === null && (hub.loading || hub.fetchedAt === null);
  // A failed load is not "no record": never tell a ranked player they're unranked.
  const standingFailed = hub.data === null && hub.error;

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

  const openChallenge = useCallback(() => {
    navigate("/challenge");
  }, [navigate]);

  // Quick Play = random matchmaking queue. The hook encapsulates POST (join),
  // GET polling, DELETE (cancel), and cleanup on unmount.
  const queue = useMatchmakingQueue();

  useEffect(() => {
    if (queue.state.status === "matched" && queue.state.duelId) {
      navigate(`/duel/${queue.state.duelId}`);
    }
  }, [queue.state.status, queue.state.duelId, navigate]);

  const queueActive = queue.state.status !== "idle";

  return (
    // Short phones (320x568): tighter top spacing so Quick Play / Challenge sit
    // fully above the tab bar without scrolling.
    <main className="flex h-full flex-col pt-[calc(env(safe-area-inset-top)+2rem)] [@media(max-height:640px)]:pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div
        className="flex flex-1 flex-col overflow-y-auto px-4"
        style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
      >
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="hm-wordmark font-display text-[2.6rem] font-black uppercase leading-[0.9] tracking-[-0.03em] text-text-primary">
            Doom<span className="text-signal">stack</span>
          </h1>
          <span className="pl-[0.55em] font-mono text-[11px] uppercase tracking-[0.55em] text-text-secondary">
            Endless&nbsp;climb
          </span>
        </header>

        <div className="mt-6 flex justify-end [@media(max-height:640px)]:mt-2">
          <BestCard standing={standing} loading={standingLoading} failed={standingFailed} />
        </div>

        {/* Scene gap — the volcanic backdrop shows through here */}
        <div className="min-h-8 flex-1 [@media(max-height:640px)]:min-h-2" />

        <div className="flex w-full flex-col gap-3 pb-4">
          <PlayButton onPress={play} />
          <DailyCard daily={daily} resetMs={resetMs} onPress={playDaily} />
          <div className="grid grid-cols-2 gap-2.5">
            <ModeTile
              icon={<BoltIcon />}
              title="Quick Play"
              subtitle="Find an opponent"
              ariaLabel="Quick play, find a random opponent"
              onPress={queue.join}
            />
            <ModeTile
              icon={<SwordsIcon />}
              title="Challenge"
              subtitle="Race your friends"
              ariaLabel="Challenge a friend to a race"
              onPress={openChallenge}
            />
          </div>
        </div>
      </div>

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
          text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35), 0 0 34px rgba(203, 242, 77, 0.18);
        }
        .hm-daily-scene {
          -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 70%);
          mask-image: linear-gradient(to right, transparent 0%, #000 70%);
        }
      `}</style>
    </main>
  );
}

/** The player's standing: best height + global rank, top-right over the scene. */
function BestCard({
  standing,
  loading,
  failed,
}: {
  standing: { peakY: number; rank: number } | null;
  loading: boolean;
  /** The dashboard didn't load: show a neutral dash, not "Unranked". */
  failed: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className="glass min-w-[8rem] rounded-[20px] border border-white/10 px-3.5 pb-2.5 pt-3"
    >
      <div className="flex items-center gap-2">
        <CrownIcon />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">
          Best
        </span>
      </div>
      {loading ? (
        <div className="mt-2 flex flex-col items-center gap-3" aria-label="Loading your best climb">
          <span className="h-6 w-24 animate-pulse rounded-md bg-elevated" />
          <span className="h-px w-full bg-white/10" />
          <span className="h-5 w-10 animate-pulse rounded-md bg-elevated" />
        </div>
      ) : (
        <>
          <p className="mt-1 text-right font-display text-[1.4rem] font-black leading-none tabular-nums text-text-primary">
            {standing ? standing.peakY.toLocaleString() : "—"}
            <span className="ml-1 text-sm font-bold uppercase text-text-secondary">
              {ALTITUDE_UNIT}
            </span>
          </p>
          <span className="mt-2 block h-px w-full bg-white/10" />
          <p
            className={`mt-1.5 text-center font-display font-black tabular-nums ${standing ? "text-lg text-signal" : "font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted"}`}
          >
            {standing ? `#${standing.rank.toLocaleString()}` : failed ? "—" : "Unranked"}
          </p>
          {failed && <span className="sr-only">Couldn&apos;t load your best climb</span>}
        </>
      )}
    </div>
  );
}

function PlayButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      aria-label="Play endless climb"
      className="cta-lime flex w-full items-center gap-4 rounded-[22px] py-3.5 pl-3.5 pr-3 text-left text-void transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#141612] text-signal shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.35)]">
        <PlayGlyph />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[2.25rem] font-black uppercase leading-[0.9] tracking-[-0.02em] text-void">
          Play
        </span>
        <span className="mt-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.32em] text-void/80">
          Endless climb
        </span>
      </span>
      <ChevronRight size={24} className="text-void" />
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
  const reset = `Resets in ${formatReset(resetMs)}`;
  const sub = daily.playedToday
    ? `Today ${daily.todayBest.toLocaleString()} ${ALTITUDE_UNIT} · ${reset}`
    : reset;
  return (
    <button
      onClick={onPress}
      aria-label="Play the daily climb"
      className="glass relative flex w-full items-center gap-3 overflow-hidden rounded-[20px] border border-white/10 px-3.5 py-3 text-left transition-transform active:scale-[0.98]"
    >
      <span
        aria-hidden
        className="hm-daily-scene pointer-events-none absolute inset-y-0 right-0 w-3/5 bg-cover bg-center opacity-60"
        style={{ backgroundImage: `url(${volcanoScene})` }}
      />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ember/60 bg-ember/15">
        <FlameIcon />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap font-display text-[15px] font-black uppercase tracking-wide text-text-primary">
            Daily Climb
          </span>
          <span className="rounded-md border border-ember/60 bg-ember/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ember">
            Daily
          </span>
          {daily.streak > 0 && (
            <span className="rounded-md border border-ember/40 bg-ember/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-ember">
              {daily.streak}🔥
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-[13px] text-text-secondary">{sub}</span>
      </span>
      <ChevronRight className="relative text-text-secondary" />
    </button>
  );
}

/** Half-width secondary mode (Quick Play, Challenge). */
function ModeTile({
  icon,
  title,
  subtitle,
  ariaLabel,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  ariaLabel: string;
  onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      aria-label={ariaLabel}
      className="glass flex w-full min-w-0 items-center gap-2 rounded-[20px] border border-white/10 py-3 pl-2.5 pr-1.5 text-left transition-transform active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-signal/50 bg-signal/10">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        {/* Sized off the viewport so both tiles hold one line down to ~360pt. */}
        <span
          className="block whitespace-nowrap font-display font-black uppercase tracking-[0.02em] text-text-primary"
          style={{ fontSize: "clamp(10px, calc(7.2vw - 15.6px), 13px)" }}
        >
          {title}
        </span>
        <span
          className="mt-0.5 block leading-snug tracking-[-0.01em] text-text-secondary"
          style={{ fontSize: "clamp(9.5px, calc(5.8vw - 12.6px), 11px)" }}
        >
          {subtitle}
        </span>
      </span>
      <ChevronRight size={14} className="-ml-0.5 text-text-secondary max-[359px]:hidden" />
    </button>
  );
}

function CrownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-signal" aria-hidden>
      <path d="M3 7.5 7.5 11 12 4.5 16.5 11 21 7.5 19 18H5L3 7.5Z" />
      <rect x="5" y="19.5" width="14" height="2" rx="1" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-ember" aria-hidden>
      <path d="M12 2c.5 3-1.5 4.5-3 6.5C7.4 10.6 6.5 12.3 6.5 14a5.5 5.5 0 0 0 11 0c0-1.7-.8-3.2-2-4.5-.6 1-1.6 1.6-2.6 1.6 1-2 .3-4.4-1.4-6.1C11.6 5 12 3.4 12 2Z" />
    </svg>
  );
}

function ChevronRight({ className = "text-text-muted", size = 18 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function SwordsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-signal" aria-hidden>
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-signal" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
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
