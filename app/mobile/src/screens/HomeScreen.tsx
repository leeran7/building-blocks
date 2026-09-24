import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tapHeavy } from "../lib/haptics";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { LogoMark } from "../components/LogoMark";
import { useHubPrefetch } from "../contexts/AppDataContext";
import { dailySummary, msUntilReset, formatReset, type DailySummary } from "../lib/daily";
import { useMatchmakingQueue } from "../hooks/useMatchmakingQueue";

export function HomeScreen() {
  const navigate = useNavigate();

  const standing = useHubPrefetch().data?.freeClimb ?? null;

  const [daily, setDaily] = useState<DailySummary>(() => dailySummary());
  const [resetMs, setResetMs] = useState<number>(() => msUntilReset());
  useEffect(() => {
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

  const queue = useMatchmakingQueue();

  useEffect(() => {
    if (queue.state.status === "matched" && queue.state.duelId) {
      navigate(`/duel/${queue.state.duelId}`);
    }
  }, [queue.state.status, queue.state.duelId, navigate]);

  const queueActive = queue.state.status !== "idle";

  return (
    <main className="flex h-full flex-col pt-[calc(env(safe-area-inset-top)+3.5rem)]">
      <div className="flex flex-1 flex-col px-6 overflow-y-auto" style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {/* Wordmark — top-aligned */}
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <LogoMark size={48} card className="mb-1" />
          <span className="font-mono text-[11px] uppercase tracking-[0.5em] text-text-muted">
            endless&nbsp;climb
          </span>
          <h1 className="hm-wordmark font-display text-[2.75rem] font-black uppercase leading-none tracking-tight text-text-primary">
            Doom<span className="text-signal">stack</span>
          </h1>
        </div>

        {/* Spacer — lets the volcanic backdrop show through; BestCard floats here */}
        <div className="relative flex-1 min-h-[120px]">
          <BestCard standing={standing} />
        </div>

        {/* Action cards — anchored at the bottom */}
        <div className="flex w-full flex-col gap-3 pb-4">
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
                Endless Climb
              </span>
            </span>
            <ChevronRight className="text-void/60" />
          </button>

          <div className="flex w-full flex-col gap-2.5">
            <DailyCard daily={daily} resetMs={resetMs} onPress={playDaily} />
            <div className="flex w-full flex-row gap-2.5">
              <QuickPlayCard onPress={queue.join} />
              <ChallengeCard onPress={openChallenge} />
            </div>
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
          text-shadow: 0 0 34px rgba(203, 242, 77, 0.14);
        }
      `}</style>
    </main>
  );
}

function BestCard({ standing }: { standing: { peakY: number; rank: number } | null }) {
  if (!standing) return null;

  return (
    <div
      aria-live="polite"
      className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-end rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 backdrop-blur-md"
    >
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        <TrophyGlyph />
        Best
      </span>
      <span className="font-display text-xl font-black tabular-nums leading-tight text-text-primary">
        {standing.peakY.toLocaleString()}
        <span className="ml-0.5 text-sm font-bold text-text-secondary">
          {ALTITUDE_UNIT.toUpperCase()}
        </span>
      </span>
      <span className="font-mono text-sm font-bold tabular-nums text-signal">
        #{standing.rank}
      </span>
    </div>
  );
}

function TrophyGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

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
  compact,
}: {
  icon: React.ReactNode;
  tint: ModeTint;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress: () => void;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const chip =
    tint === "ember"
      ? "border-ember/40 bg-ember/10"
      : "border-signal/40 bg-signal/10";
  return (
    <button
      onClick={onPress}
      aria-label={ariaLabel ?? title}
      className={`flex items-center rounded-2xl border border-border-subtle bg-surface/70 text-left transition-transform active:scale-[0.98] ${
        compact
          ? "flex-1 gap-2.5 px-3 py-3"
          : "w-full gap-3 px-4 py-3.5"
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center border ${chip} ${
        compact ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl"
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display text-sm font-black uppercase tracking-wide text-text-primary">
            {title}
          </span>
          {badge}
        </span>
        <span className={`mt-0.5 block font-mono uppercase tracking-[0.06em] text-text-secondary leading-snug whitespace-pre-line ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}>
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
    ? `Today ${daily.todayBest.toLocaleString()}${ALTITUDE_UNIT}\nResets in ${formatReset(resetMs)}`
    : `Resets in ${formatReset(resetMs)}`;
  return (
    <ModeCard
      icon={<FlameIcon />}
      tint="ember"
      title="Daily Climb"
      subtitle={sub}
      ariaLabel="Play the daily climb"
      badge={
        <>
          <span className="rounded-full bg-signal/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-signal">
            Daily
          </span>
          {daily.streak > 0 && (
            <span className="rounded-full bg-ember/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-ember">
              {daily.streak}🔥
            </span>
          )}
        </>
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

function ChallengeCard({ onPress }: { onPress: () => void }) {
  return (
    <ModeCard
      icon={<SwordsIcon />}
      tint="signal"
      title="Challenge"
      subtitle="Race your friends"
      ariaLabel="Challenge a friend to a race"
      compact
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

function QuickPlayCard({ onPress }: { onPress: () => void }) {
  return (
    <ModeCard
      icon={<BoltIcon />}
      tint="signal"
      title="Quick Play"
      subtitle="Find an opponent"
      ariaLabel="Quick play -- find a random opponent"
      compact
      onPress={onPress}
    />
  );
}

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
