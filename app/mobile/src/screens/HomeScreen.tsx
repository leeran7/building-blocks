import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tapHeavy } from "../lib/haptics";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { useDailyLeaderboard, useHubPrefetch } from "../contexts/AppDataContext";
import { dailySummary, formatReset, type DailySummary } from "../lib/daily";
import { useUtcDay } from "../hooks/useUtcDay";
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

  // Daily challenge state. The UTC clock re-reads on a slow tick, at the reset
  // and on return to the foreground; the local summary is recomputed on each
  // read so the card never shows a stale streak across the reset.
  const clock = useUtcDay();
  const [daily, setDaily] = useState<DailySummary>(() => dailySummary());
  useEffect(() => {
    setDaily(dailySummary());
  }, [clock]);
  // Server-confirmed standing on today's board, when there is one.
  const todayBoard = useDailyLeaderboard(clock.day).data;
  const todayMe = todayBoard && todayBoard.day === clock.day ? todayBoard.me : null;

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
          <h1 className="hm-wordmark font-display text-wordmark font-black uppercase tracking-[-0.03em] text-text-primary">
            Doom<span className="text-signal">stack</span>
          </h1>
          <span className="pl-(--tracking-eyebrow) font-mono text-label uppercase tracking-eyebrow text-text-secondary">
            Endless&nbsp;climb
          </span>
        </header>

        <div className="mt-6 flex justify-end [@media(max-height:640px)]:mt-2">
          <BestCard standing={standing} loading={standingLoading} failed={standingFailed} />
        </div>

        {/* Scene gap — the volcanic backdrop shows through here */}
        <div className="min-h-8 flex-1 [@media(max-height:640px)]:min-h-2" />

        <div className="flex w-full flex-col gap-3 pb-4 [@media(max-height:640px)]:pb-2">
          <PlayButton onPress={play} />
          <DailyCard daily={daily} today={todayMe} resetMs={clock.msUntilReset} onPress={playDaily} />
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
        <span className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">
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
          <p className="mt-1 text-right font-display text-headline font-black leading-none tabular-nums text-text-primary">
            {standing ? standing.peakY.toLocaleString() : "—"}
            <span className="ml-1 text-meta font-bold uppercase text-text-secondary">
              {ALTITUDE_UNIT}
            </span>
          </p>
          <span className="mt-2 block h-px w-full bg-white/10" />
          <p
            className={`mt-1.5 text-center font-display font-black tabular-nums ${standing ? "text-lead text-signal" : "font-mono text-label uppercase tracking-label text-text-muted"}`}
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
      className="cta-lime flex min-h-[56px] w-full items-center gap-4 rounded-[22px] py-3 pl-3 pr-3 text-left text-void transition-transform active:scale-[0.97] [@media(max-height:640px)]:py-2.5"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#141612] text-signal shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.35)]">
        <PlayGlyph />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-cta font-black uppercase tracking-[-0.01em] text-void">
          Play
        </span>
        <span className="mt-1 block font-mono text-label font-bold uppercase tracking-label text-void/80">
          Endless climb
        </span>
      </span>
      <ChevronRight size={24} className="text-void" />
    </button>
  );
}

function DailyCard({
  daily,
  today,
  resetMs,
  onPress,
}: {
  daily: DailySummary;
  /** Today's server-verified standing; null until known or when not played. */
  today: { rank: number | null; peakY: number } | null;
  resetMs: number;
  onPress: () => void;
}) {
  const subId = useId();
  const reset = `Resets in ${formatReset(resetMs)}`;
  // The verified rank wins over the device-local best: it is what the board shows.
  const sub =
    today && today.rank !== null
      ? `#${today.rank.toLocaleString()} today · ${today.peakY.toLocaleString()} ${ALTITUDE_UNIT} · ${reset}`
      : daily.playedToday
        ? `Today ${daily.todayBest.toLocaleString()} ${ALTITUDE_UNIT} · ${reset}`
        : reset;
  return (
    <button
      onClick={onPress}
      aria-label="Play the daily climb"
      aria-describedby={subId}
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
          <span className="whitespace-nowrap font-display text-body font-black uppercase tracking-wide text-text-primary">
            Daily Climb
          </span>
          <span className="rounded-md border border-ember/60 bg-void/80 px-1.5 py-0.5 font-mono text-label font-bold uppercase tracking-[0.1em] text-ember">
            Daily
          </span>
          {daily.streak > 0 && (
            <span className="rounded-md border border-ember/40 bg-void/80 px-1.5 py-0.5 font-mono text-label font-bold tabular-nums text-ember">
              {daily.streak}🔥
            </span>
          )}
        </span>
        <span id={subId} className="mt-1 block truncate text-meta text-text-secondary">{sub}</span>
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
      className="glass @container w-full min-w-0 rounded-[20px] border border-white/10 py-3 pl-2.5 pr-2 text-left transition-transform active:scale-[0.98] [@media(max-height:640px)]:py-2.5"
    >
      {/* A container query in rem, not a viewport clamp: the icon sits beside the
          text only while the tile is wide enough for its longest line (9.5rem of
          content), so a narrow phone or a large text size stacks it above instead
          of pushing CHALLENGE past the tile edge. */}
      <span className="flex flex-col items-start gap-1.5 @min-[9.5rem]:flex-row @min-[9.5rem]:items-center @min-[9.5rem]:gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-signal/50 bg-signal/10">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-meta font-black uppercase leading-tight tracking-[0.02em] text-text-primary">
            {title}
          </span>
          <span className="mt-0.5 block text-meta leading-snug tracking-[-0.01em] text-text-secondary">
            {subtitle}
          </span>
        </span>
        <ChevronRight size={14} className="hidden text-text-secondary @min-[11rem]:block" />
      </span>
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
          <p className="mt-2 font-mono text-label uppercase tracking-label text-text-secondary">
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
          <p className="mt-2 font-mono text-label uppercase tracking-label text-text-secondary">
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
