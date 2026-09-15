import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tapLight, tapHeavy } from "../lib/haptics";
import { apiFetch, API_BASE } from "../lib/api";
import { shareInvite } from "@app/lib/shareInvite";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { LogoMark } from "../components/LogoMark";
import { dailySummary, msUntilReset, formatReset, type DailySummary } from "../lib/daily";

/**
 * Home = the game title screen. Play-first and hub-centric: a dominant, molten
 * PLAY button drops straight into a fresh random climb (no level select), with
 * the player's live standing underneath and the secondary destinations as
 * HUD-style icon buttons. Deliberately NOT a bottom-tab content layout — this
 * reads as a game main menu.
 */
interface Standing {
  peakY: number;
  rank: number;
  totalClimbers: number;
}

export function HomeScreen() {
  const navigate = useNavigate();
  const [standing, setStanding] = useState<Standing | null>(null);

  // Pull the player's best + rank so the hub feels personal. The app is
  // auth-gated, so a real account is always present here.
  useEffect(() => {
    let alive = true;
    apiFetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.freeClimb) setStanding(d.freeClimb);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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

  return (
    <main className="flex h-full flex-col pt-[calc(env(safe-area-inset-top)+3.5rem)]">
      {/* Game content — flex-1 keeps BottomNav pinned at the bottom */}
      <div className="flex flex-1 flex-col items-center justify-between px-6 text-center">
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

        {/* Dominant, molten PLAY (endless quick-play) + live standing */}
        <div className="flex w-full flex-col items-center gap-5 pb-4">
          <button
            onClick={play}
            aria-label="Play"
            className="flex w-full items-center gap-4 rounded-2xl border border-signal/50 bg-surface/80 px-5 py-4 text-left shadow-[0_0_28px_-6px_rgba(203,242,77,0.35)] transition-transform active:scale-[0.97]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-signal/40 bg-signal/10">
              <PlayGlyph />
            </span>
            <span className="flex-1">
              <span className="block font-display text-xl font-black uppercase tracking-wide text-signal" style={{ textShadow: "0 0 18px rgba(203,242,77,0.45)" }}>
                Play
              </span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary">
                Endless quick climb
              </span>
            </span>
            <ChevronRight />
          </button>

          <div className="flex w-full flex-col gap-2.5">
            <DailyCard daily={daily} resetMs={resetMs} onPress={playDaily} />
            <ChallengeCard
              busy={challengeBusy}
              error={challengeError}
              onPress={startChallenge}
            />
          </div>
        </div>
      </div>

      <style>{`
        .hm-wordmark {
          text-shadow: 0 0 34px rgba(203, 242, 77, 0.14);
        }
      `}</style>
    </main>
  );
}

function StandingLine({ standing }: { standing: Standing | null }) {
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
      className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 text-left transition-transform active:scale-[0.98]"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${chip}`}>
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-signal" aria-hidden>
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

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted" aria-hidden>
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

