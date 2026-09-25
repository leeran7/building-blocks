import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard, useLeaderboard, useSettings, type ClimberRank } from "../contexts/AppDataContext";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { StateMessage } from "../components/ui";
import { PullToRefresh } from "../components/PullToRefresh";
import { tapLight } from "../lib/haptics";
import { initialsOf, standingFor, tintFor, type Standing } from "../lib/leaderboard";

type Medal = 1 | 2 | 3;

const MEDAL: Record<Medal, { face: string; rim: string; text: string }> = {
  1: { face: "linear-gradient(160deg,#ffe58a,#f5b82e 55%,#b8791a)", rim: "#7a4f0e", text: "#3a2604" },
  2: { face: "linear-gradient(160deg,#f4f6f9,#b9c0ca 55%,#7d8591)", rim: "#4a515c", text: "#1f242b" },
  3: { face: "linear-gradient(160deg,#ffb27a,#d9713a 55%,#8f3f17)", rim: "#5c2508", text: "#2e1204" },
};

export function LeaderboardScreen() {
  const { user } = useAuth();
  const { data, loading: sliceLoading, error, refreshLeaderboard } = useLeaderboard();
  const own = useDashboard().data?.freeClimb ?? null;
  const onPublicBoard = useSettings().data?.leaderboardConsent ?? true;
  const climbers = data ?? [];
  const loading = sliceLoading && data === null;
  const meId = user?.uid ?? null;

  const handleRefresh = useCallback(() => refreshLeaderboard(), [refreshLeaderboard]);

  const podium = climbers.slice(0, 3);
  const rest = climbers.slice(3);
  const standing = standingFor(climbers, meId, own, onPublicBoard);

  return (
    <main className="flex h-full flex-col">
      <PullToRefresh onRefresh={handleRefresh}>
        <Header />

        {loading && <LoadingState />}

        {error && (
          <StateMessage>
            Couldn&apos;t load the leaderboard. Check your connection and try again.
          </StateMessage>
        )}

        {!loading && !error && climbers.length === 0 && (
          <StateMessage>No climbs yet. Be the first to the top.</StateMessage>
        )}

        {!loading && !error && climbers.length > 0 && (
          <div className="flex flex-col gap-4 pb-4">
            <Podium climbers={podium} meId={meId} />
            <StandingBanner standing={standing} meRowId={rest.some((c) => c.userId === meId) ? "lb-me" : null} />
            {rest.length > 0 && <RankTable climbers={rest} meId={meId} />}
          </div>
        )}
      </PullToRefresh>

      <style>{`
        .lb-title {
          background: linear-gradient(180deg, #ffffff 0%, #e4e2dc 38%, #9c98a3 62%, #d9d6cf 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.55)) drop-shadow(0 0 18px rgba(255, 90, 44, 0.25));
        }
        .lb-stone {
          background: linear-gradient(180deg, rgba(38, 36, 42, 0.94) 0%, rgba(20, 19, 24, 0.96) 100%);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            inset 0 -2px 0 rgba(0, 0, 0, 0.4),
            0 14px 30px -12px rgba(255, 90, 44, 0.45);
        }
        .lb-glass {
          background: rgba(16, 15, 20, 0.88);
          -webkit-backdrop-filter: blur(14px) saturate(1.2);
          backdrop-filter: blur(14px) saturate(1.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 30px -14px rgba(0, 0, 0, 0.8);
        }
        .lb-banner {
          background:
            linear-gradient(90deg, rgba(203, 242, 77, 0.16), rgba(203, 242, 77, 0.04) 60%, rgba(203, 242, 77, 0.1)),
            rgba(16, 15, 20, 0.9);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          box-shadow: inset 0 0 0 1px rgba(203, 242, 77, 0.55), 0 0 28px -6px rgba(203, 242, 77, 0.35);
        }
        .lb-hex { clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); }
      `}</style>
    </main>
  );
}

function Header() {
  return (
    <header className="flex flex-col items-center pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] text-center">
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-signal/70" />
        <span className="pl-[0.45em] font-mono text-[11px] font-bold uppercase tracking-[0.45em] text-signal">
          Doomstack
        </span>
        <span className="h-px w-8 bg-signal/70" />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <h1
          className="lb-title font-display font-black uppercase leading-none tracking-[-0.02em]"
          style={{ fontSize: "clamp(1.9rem, 10.4vw, 2.6rem)" }}
        >
          Leaderboard
        </h1>
        <TrophyBadge />
      </div>
      <p className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
        <span>Global</span>
        <span aria-hidden className="h-1 w-1 rounded-full bg-text-muted" />
        <span>All time</span>
      </p>
    </header>
  );
}

/** Top three on stone pedestals, #1 raised in the middle (2 · 1 · 3). */
function Podium({ climbers, meId }: { climbers: ClimberRank[]; meId: string | null }) {
  const [first, second, third] = climbers;
  return (
    <ol className="grid grid-cols-[1fr_1.18fr_1fr] items-end gap-2" aria-label="Top three climbers">
      <PodiumSpot climber={second} place={2} meId={meId} />
      <PodiumSpot climber={first} place={1} meId={meId} />
      <PodiumSpot climber={third} place={3} meId={meId} />
    </ol>
  );
}

function PodiumSpot({
  climber,
  place,
  meId,
}: {
  climber: ClimberRank | undefined;
  place: Medal;
  meId: string | null;
}) {
  const isFirst = place === 1;
  const isMe = climber ? climber.userId === meId : false;
  return (
    <li className="flex min-w-0 flex-col items-center">
      <div className="relative flex flex-col items-center">
        {isFirst && <CrownGlyph className="-mb-1 h-7 w-9 drop-shadow-[0_0_10px_rgba(245,184,46,0.6)]" />}
        {climber ? (
          <Avatar climber={climber} size={isFirst ? 68 : 56} />
        ) : (
          <span
            className="lb-hex flex items-center justify-center bg-elevated/80 text-text-muted"
            style={{ width: isFirst ? 68 : 56, height: isFirst ? 68 : 56 }}
          >
            ?
          </span>
        )}
        <MedalBadge place={place} className="-mt-4" />
      </div>
      <div
        className={`lb-stone -mt-3 w-full rounded-2xl border px-2 pb-3 pt-5 text-center ${
          isFirst ? "min-h-[7.5rem] border-signal/35" : "min-h-[6rem] border-white/10"
        }`}
      >
        {climber ? (
          <>
            <p className="line-clamp-2 break-words font-display text-[13px] font-bold leading-tight text-text-primary">
              {climber.handle}
            </p>
            {isMe && (
              <p className="mt-0.5 font-display text-[11px] font-black uppercase tracking-[0.12em] text-signal">
                You
              </p>
            )}
            <span className={`mx-auto mt-1.5 block h-px w-4/5 ${isFirst ? "bg-signal/25" : "bg-white/10"}`} />
            <p
              className={`mt-1.5 font-display font-black leading-none tabular-nums ${
                isFirst ? "text-signal" : "text-text-primary"
              }`}
              style={{ fontSize: isFirst ? "clamp(13px, calc(3.6vw + 1px), 18px)" : "clamp(11px, 3.4vw, 15px)" }}
            >
              {climber.peakY.toLocaleString()}
              <span className="ml-0.5 text-[0.7em] font-bold text-text-secondary">{ALTITUDE_UNIT}</span>
            </p>
          </>
        ) : (
          <p className="pt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">Open</p>
        )}
      </div>
    </li>
  );
}

function StandingBanner({ standing, meRowId }: { standing: Standing; meRowId: string | null }) {
  const navigate = useNavigate();
  const ranked = standing.kind === "ranked";
  const headline =
    standing.kind === "ranked"
      ? `You're #${standing.rank.toLocaleString()}`
      : standing.kind === "hidden"
        ? "You're hidden"
        : "Not ranked yet";
  const detail =
    standing.kind === "ranked"
      ? standing.detail
      : standing.kind === "hidden"
        ? "Turn on leaderboard visibility in Edit profile"
        : "Finish a climb to get on the board";

  const body = (
    <>
      <CrownOutline muted={!ranked} />
      <span className={`h-9 w-px shrink-0 ${ranked ? "bg-signal/30" : "bg-white/15"}`} />
      <span className="min-w-0 flex-1">
        <span
          className={`block font-display text-[1.45rem] font-black uppercase leading-none tracking-tight ${ranked ? "text-signal" : "text-text-primary"}`}
        >
          {headline}
        </span>
        <span className="mt-1 block truncate text-[13px] text-text-secondary">{detail}</span>
      </span>
      {!ranked && <ChevronRight />}
      {ranked && (
        <span className="lb-hex flex h-11 w-11 shrink-0 items-center justify-center bg-signal/80 p-[2px]">
          <span className="lb-hex flex h-full w-full items-center justify-center bg-[#15170f] text-signal">
            <ChevronUp />
          </span>
        </span>
      )}
    </>
  );

  const className = `${ranked ? "lb-banner" : "lb-glass border border-white/10"} flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left`;

  const action =
    standing.kind === "hidden"
      ? { label: "Edit profile", run: () => navigate("/profile/edit") }
      : standing.kind === "unranked"
        ? { label: "Play", run: () => navigate("/climb") }
        : meRowId
          ? {
              label: "Show my row",
              run: () => document.getElementById(meRowId)?.scrollIntoView({ behavior: "smooth", block: "center" }),
            }
          : null;

  if (action) {
    return (
      <button
        type="button"
        aria-label={`${headline}. ${detail}. ${action.label}`}
        onClick={() => {
          void tapLight();
          action.run();
        }}
        className={`${className} transition-transform active:scale-[0.98]`}
      >
        {body}
      </button>
    );
  }
  return (
    <div aria-live="polite" className={className}>
      {body}
    </div>
  );
}

function RankTable({ climbers, meId }: { climbers: ClimberRank[]; meId: string | null }) {
  return (
    <section className="lb-glass rounded-3xl border border-white/10 p-2" aria-label="Rankings">
      <div className="flex items-center gap-2.5 pb-2 pl-2 pr-3 pt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">
        <span className="w-6 text-center">#</span>
        <span className="flex-1 pl-11">Player</span>
        <span>Height ({ALTITUDE_UNIT})</span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {climbers.map((c) => {
          const isMe = c.userId === meId;
          return (
            <li
              key={c.userId}
              id={isMe ? "lb-me" : undefined}
              className={`flex items-center gap-2.5 rounded-2xl border py-2 pl-2 pr-3 ${
                isMe ? "border-signal/50 bg-signal/[0.09]" : "border-white/[0.06] bg-white/[0.025]"
              }`}
            >
              <span className="w-6 text-center font-display text-base font-black tabular-nums text-text-secondary">
                {c.rank}
              </span>
              <Avatar climber={c} size={38} />
              <span
                className="min-w-0 flex-1 truncate font-display font-bold text-text-primary"
                style={{ fontSize: "clamp(13px, calc(2.2vw + 6.5px), 15px)" }}
              >
                {c.handle}
                {isMe && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-signal">you</span>
                )}
              </span>
              <span
                className="shrink-0 font-sans font-medium tabular-nums text-text-secondary"
                style={{ fontSize: "clamp(13px, calc(2.2vw + 6.5px), 15px)" }}
              >
                {c.peakY.toLocaleString()}
                <span className="ml-0.5 text-text-muted">{ALTITUDE_UNIT}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Hex badge with the climber's initials, tinted per player. */
function Avatar({ climber, size }: { climber: ClimberRank; size: number }) {
  const tint = tintFor(climber.userId);
  return (
    <span
      aria-hidden
      className="lb-hex flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, background: tint, padding: 2 }}
    >
      <span
        className="lb-hex flex h-full w-full items-center justify-center font-display font-black"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 38%, #17161c), #0f0e12 80%)`,
          color: tint,
          fontSize: size * 0.34,
        }}
      >
        {initialsOf(climber.handle)}
      </span>
    </span>
  );
}

function MedalBadge({ place, className = "" }: { place: Medal; className?: string }) {
  const m = MEDAL[place];
  const size = place === 1 ? 40 : 34;
  return (
    <span
      className={`lb-hex relative z-10 flex items-center justify-center ${className}`}
      style={{ width: size, height: size, background: m.rim, padding: 2 }}
    >
      <span
        className="lb-hex flex h-full w-full items-center justify-center font-display font-black"
        style={{ background: m.face, color: m.text, fontSize: size * 0.48 }}
      >
        {place}
      </span>
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 pb-4" aria-label="Loading leaderboard">
      <div className="grid grid-cols-[1fr_1.18fr_1fr] items-end gap-2">
        {[96, 132, 96].map((h, i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-surface/70" style={{ height: h + 60 }} />
        ))}
      </div>
      <div className="h-[68px] animate-pulse rounded-2xl border border-signal/20 bg-surface/70" />
      <div className="flex flex-col gap-1.5 rounded-3xl border border-white/10 bg-surface/60 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[54px] animate-pulse rounded-2xl bg-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}

function TrophyBadge() {
  return (
    <svg width="36" height="40" viewBox="0 0 36 40" aria-hidden className="drop-shadow-[0_0_10px_rgba(245,184,46,0.45)]">
      <defs>
        <linearGradient id="lb-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe58a" />
          <stop offset="0.55" stopColor="#f5b82e" />
          <stop offset="1" stopColor="#a86a12" />
        </linearGradient>
      </defs>
      <path d="M11 6h14v9a7 7 0 0 1-14 0V6Z" fill="url(#lb-gold)" />
      <path d="M11 9H7a4 4 0 0 0 4 6M25 9h4a4 4 0 0 1-4 6" fill="none" stroke="url(#lb-gold)" strokeWidth="2.2" />
      <path d="M16 22h4v5h-4z" fill="url(#lb-gold)" />
      <rect x="11" y="27" width="14" height="4" rx="1" fill="url(#lb-gold)" />
      <path d="M12 3.5 14.5 5.5 18 1.5 21.5 5.5 24 3.5 23.5 6h-11Z" fill="url(#lb-gold)" />
    </svg>
  );
}

function CrownGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 28" className={className} aria-hidden>
      <defs>
        <linearGradient id="lb-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe58a" />
          <stop offset="1" stopColor="#d18f1f" />
        </linearGradient>
      </defs>
      <path d="M3 8l8 7 7-12 7 12 8-7-3 16H6L3 8Z" fill="url(#lb-crown)" stroke="#7a4f0e" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="18" cy="3" r="2" fill="#ffe58a" />
    </svg>
  );
}

function CrownOutline({ muted }: { muted: boolean }) {
  return (
    <svg
      width="34"
      height="30"
      viewBox="0 0 24 22"
      fill="currentColor"
      className={`shrink-0 ${muted ? "text-text-muted" : "text-signal drop-shadow-[0_0_8px_rgba(203,242,77,0.5)]"}`}
      aria-hidden
    >
      <path d="M2 6 7 10 12 3 17 10 22 6 20 17H4L2 6Z" />
      <rect x="4" y="18.5" width="16" height="2.5" rx="1" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}
