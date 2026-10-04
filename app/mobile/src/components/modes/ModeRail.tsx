import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { tapHeavy, tapLight } from "../../lib/haptics";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { useDailyLeaderboard, useHubPrefetch } from "../../contexts/AppDataContext";
import { dailySummary, formatReset, type DailySummary } from "@app/lib/daily";
import { useUtcDay } from "../../hooks/useUtcDay";
import { useMatchmakingQueue } from "../../hooks/useMatchmakingQueue";
import { CrownIcon, FlameIcon, SwordsIcon } from "./icons";
import { SearchingOverlay } from "./SearchingOverlay";
import { VersusSheet } from "./VersusSheet";

/** Today's server-verified standing on the Daily board. */
type DailyStanding = { rank: number | null; peakY: number } | null;

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 0 });
const rankBadge = (rank: number) => `#${compact.format(rank)}`;

/**
 * The Daily button's corner badge and its spoken line. The verified rank wins
 * over the device-local best: it is what the board shows. Unplayed, the badge
 * counts down to the reset ("18h", "45m"). A live streak is said last.
 */
export function dailyRailCopy(
  daily: DailySummary,
  today: DailyStanding,
  resetMs: number,
): { badge: string; detail: string } {
  const reset = formatReset(resetMs);
  const resetLine = `Resets in ${reset}${daily.streak > 0 ? ` · ${daily.streak}-day streak` : ""}`;
  if (today && today.rank !== null) {
    return {
      badge: rankBadge(today.rank),
      detail: `#${today.rank.toLocaleString()} today · ${today.peakY.toLocaleString()} ${ALTITUDE_UNIT} · ${resetLine}`,
    };
  }
  if (daily.playedToday) {
    return { badge: "✓", detail: `Today ${daily.todayBest.toLocaleString()} ${ALTITUDE_UNIT} · ${resetLine}` };
  }
  return { badge: reset.split(" ")[0], detail: resetLine };
}

/**
 * The Ranks button's badge and spoken line: the all-time rank when there is
 * one. A failed load is not "no record": never tell a ranked player they're
 * unranked.
 */
export function ranksRailCopy(
  standing: { peakY: number; rank: number } | null,
  loading: boolean,
  failed: boolean,
): { badge: string | null; detail: string } {
  if (loading) return { badge: null, detail: "Loading your rank…" };
  if (standing) {
    return {
      badge: rankBadge(standing.rank),
      detail: `#${standing.rank.toLocaleString()} · best ${standing.peakY.toLocaleString()} ${ALTITUDE_UNIT}`,
    };
  }
  if (failed) return { badge: null, detail: "World and friends rankings" };
  return { badge: null, detail: "Unranked · climb to get ranked" };
}

/**
 * The map's mode rail: the game's other ways to play, as event buttons on the
 * right edge of the level map (Candy Crush style). Daily starts today's tower
 * in one tap, Versus opens Quick Play and Challenge, Ranks opens the
 * Leaderboard. Endless stays on the map's Play bar.
 */
export function ModeRail() {
  const navigate = useNavigate();

  // Warm the shared cache so Profile / Leaderboard are instant on first visit;
  // the returned dashboard slice also feeds the Ranks badge.
  const hub = useHubPrefetch();
  const standing = hub.data?.freeClimb ?? null;
  const standingLoading = hub.data === null && (hub.loading || hub.fetchedAt === null);
  const standingFailed = hub.data === null && hub.error;

  // Daily challenge state. The UTC clock re-reads on a slow tick, at the reset
  // and on return to the foreground; the local summary is recomputed on each
  // read so the badge never shows a stale state across the reset.
  const clock = useUtcDay();
  const [daily, setDaily] = useState<DailySummary>(() => dailySummary());
  useEffect(() => {
    setDaily(dailySummary());
  }, [clock]);
  const todayBoard = useDailyLeaderboard(clock.day).data;
  const todayMe = todayBoard && todayBoard.day === clock.day ? todayBoard.me : null;

  const dailyCopy = dailyRailCopy(daily, todayMe, clock.msUntilReset);
  const ranksCopy = ranksRailCopy(standing, standingLoading, standingFailed);

  const [versusOpen, setVersusOpen] = useState(false);
  const closeVersus = useCallback(() => setVersusOpen(false), []);

  // Quick Play = random matchmaking queue. Held here, not in the sheet, so the
  // search overlay stays up after the sheet closes.
  const queue = useMatchmakingQueue();
  useEffect(() => {
    if (queue.state.status === "matched" && queue.state.duelId) {
      navigate(`/duel/${queue.state.duelId}`);
    }
  }, [queue.state.status, queue.state.duelId, navigate]);

  return (
    <>
      <div data-tour="modes" className="pointer-events-auto flex flex-col items-center gap-3 [@media(max-height:640px)]:gap-2">
        <RailButton
          label="Daily"
          ariaLabel="Daily Climb"
          detail={dailyCopy.detail}
          badge={dailyCopy.badge}
          tone="ember"
          onPress={() => {
            void tapHeavy();
            navigate("/climb?daily=1");
          }}
        >
          <FlameIcon />
        </RailButton>
        <RailButton
          label="Versus"
          ariaLabel="Versus"
          detail="Quick Play or challenge a friend"
          tone="signal"
          onPress={() => {
            void tapLight();
            setVersusOpen(true);
          }}
        >
          <SwordsIcon size={22} />
        </RailButton>
        <RailButton
          label="Ranks"
          ariaLabel="Ranks"
          detail={ranksCopy.detail}
          badge={ranksCopy.badge}
          tone="signal"
          onPress={() => {
            void tapLight();
            navigate("/leaderboard");
          }}
        >
          <CrownIcon size={22} />
        </RailButton>
      </div>

      <AnimatePresence>
        {versusOpen && (
          <VersusSheet
            onQuickPlay={() => {
              setVersusOpen(false);
              queue.join();
            }}
            onChallenge={() => {
              setVersusOpen(false);
              navigate("/challenge");
            }}
            onClose={closeVersus}
          />
        )}
      </AnimatePresence>

      {queue.state.status !== "idle" && (
        <SearchingOverlay
          status={queue.state.status}
          errorMessage={queue.state.errorMessage}
          onCancel={queue.cancel}
          onRetry={queue.join}
          onDismiss={queue.reset}
        />
      )}
    </>
  );
}

function RailButton({
  label,
  ariaLabel,
  detail,
  badge = null,
  tone,
  onPress,
  children,
}: {
  label: string;
  /** Starts with the visible label, so voice control finds it by what it says. */
  ariaLabel: string;
  /** Spoken after the name; the badge alone is too terse to read out. */
  detail: string;
  badge?: string | null;
  tone: "ember" | "signal";
  onPress: () => void;
  children: ReactNode;
}) {
  const detailId = useId();
  const ring = tone === "ember" ? "border-ember/70 bg-ember/15" : "border-signal/60 bg-signal/10";
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      aria-describedby={detailId}
      className="flex min-w-[52px] flex-col items-center gap-1 transition-transform active:scale-95"
    >
      <span
        className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-2xl border bg-void/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur-xl [@media(max-height:640px)]:h-11 [@media(max-height:640px)]:w-11 ${ring}`}
      >
        {children}
        {badge && (
          <span
            aria-hidden
            data-badge
            className="absolute -right-2 -top-2 rounded-md border border-ember/60 bg-void px-1 py-px font-mono text-[10px] font-bold tabular-nums text-ember"
          >
            {badge}
          </span>
        )}
      </span>
      <span aria-hidden className="font-mono text-[10px] font-bold uppercase tracking-label text-text-primary [text-shadow:0_1px_2px_#000]">
        {label}
      </span>
      <span id={detailId} className="sr-only">
        {detail}
      </span>
    </button>
  );
}
