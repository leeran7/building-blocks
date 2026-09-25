import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  useDashboard,
  useFriendsLeaderboard,
  useLeaderboard,
  useSettings,
  type ClimberRank,
} from "../contexts/AppDataContext";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { Button, RetryPanel, StateMessage } from "../components/ui";
import { PullToRefresh } from "../components/PullToRefresh";
import { tapLight } from "../lib/haptics";
import { friendsFooter, standingFor, type Standing } from "../lib/leaderboard";
import { HexAvatar } from "../components/HexAvatar";
import { HubHeader } from "../components/HubHeader";
import { useRetry } from "../hooks/useRetry";
import { prefersReducedMotion } from "../lib/motion";

type Medal = 1 | 2 | 3;

const MEDAL: Record<Medal, { face: string; rim: string; text: string }> = {
  1: { face: "linear-gradient(160deg,#ffe58a,#f5b82e 55%,#b8791a)", rim: "#7a4f0e", text: "#3a2604" },
  2: { face: "linear-gradient(160deg,#f4f6f9,#b9c0ca 55%,#7d8591)", rim: "#4a515c", text: "#1f242b" },
  // Bronze is lighter at the foot than the old #8f3f17 so the digit clears 4.5:1 across the face.
  3: { face: "linear-gradient(160deg,#ffb888,#e3834e 55%,#bf6430)", rim: "#5c2508", text: "#1c0a02" },
};

type Scope = "global" | "friends";

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "global", label: "Global" },
  { id: "friends", label: "Friends" },
];

/**
 * What the board panel shows. `empty` is the Global board with no climbs;
 * `noFriendsYet` is a Friends board with only the caller on it and nobody
 * hidden or unclimbed. A Friends board with no climbers but hidden or
 * unclimbed friends is `ready`: the "Not ranked yet" banner plus the footer.
 */
type BoardView = "loading" | "error" | "empty" | "noFriendsYet" | "ready";

const PANEL_ID = "lb-panel";
const LOAD_FAILED_MESSAGE = "Couldn't load the leaderboard. Check your connection and try again.";
const tabId = (scope: Scope) => `lb-tab-${scope}`;

export function LeaderboardScreen() {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("global");
  const global = useLeaderboard();
  const friends = useFriendsLeaderboard(scope === "friends");
  const own = useDashboard().data?.freeClimb ?? null;
  const onPublicBoard = useSettings().data?.leaderboardConsent ?? true;
  const meId = user?.uid ?? null;

  const { refreshLeaderboard } = global;
  const { refreshFriendsLeaderboard } = friends;
  const handleRefresh = useCallback(
    () => (scope === "friends" ? refreshFriendsLeaderboard() : refreshLeaderboard()),
    [scope, refreshFriendsLeaderboard, refreshLeaderboard],
  );

  // One per scope: a retry refreshes only its own board, and a Global retry
  // still in flight never paints "Retrying…" over the Friends tab.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const globalRetry = useRetry(refreshLeaderboard, {
    failed: global.error,
    hasData: global.data !== null,
    focusOnRecover: headingRef,
  });
  const friendsRetry = useRetry(refreshFriendsLeaderboard, {
    failed: friends.error,
    hasData: friends.data !== null,
    focusOnRecover: headingRef,
  });

  const active = scope === "friends" ? friends : global;
  const activeRetry = scope === "friends" ? friendsRetry : globalRetry;
  const climbers = (scope === "friends" ? friends.data?.climbers : global.data) ?? [];

  const podium = climbers.slice(0, 3);
  const rest = climbers.slice(3);
  const standing =
    scope === "friends" ? standingFor(climbers, meId, null, true) : standingFor(climbers, meId, own, onPublicBoard);

  const hiddenCount = friends.data?.hiddenCount ?? 0;
  const notClimbedCount = friends.data?.notClimbedCount ?? 0;
  const footer = scope === "friends" ? friendsFooter(hiddenCount, notClimbedCount) : null;
  const noFriendsYet =
    scope === "friends" && climbers.every((c) => c.userId === meId) && hiddenCount === 0 && notClimbedCount === 0;

  // showError stays true through a retry so Try again (and its focus) stays put.
  const view: BoardView = activeRetry.showError
    ? "error"
    : // Also covers the render before the Friends tab's first fetch starts,
      // which would otherwise flash the "Not ranked yet" banner.
      active.data === null
      ? "loading"
      : noFriendsYet
        ? "noFriendsYet"
        : scope === "global" && climbers.length === 0
          ? "empty"
          : "ready";

  return (
    <main className="flex h-full flex-col">
      <PullToRefresh onRefresh={handleRefresh}>
        <Header scope={scope} headingRef={headingRef} />
        <ScopeTabs scope={scope} onChange={setScope} />

        <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(scope)}>
          {view === "loading" && <LoadingState />}

          {view === "error" && (
            <RetryPanel
              message={LOAD_FAILED_MESSAGE}
              retrying={activeRetry.retrying}
              attempts={activeRetry.attempts}
              onRetry={() => void activeRetry.retry()}
            />
          )}

          {view === "noFriendsYet" && <RaceFriendsCard />}

          {view === "empty" && <EmptyGlobalBoard />}

          {view === "ready" && (
            <>
              <div className="flex flex-col gap-4 pb-4">
                {podium.length > 0 && <Podium climbers={podium} meId={meId} />}
                <StandingBanner standing={standing} meRowId={rest.some((c) => c.userId === meId) ? "lb-me" : null} />
                {rest.length > 0 && <RankTable climbers={rest} meId={meId} />}
              </div>
              {footer && (
                <p className="glass mx-auto mb-4 flex w-fit max-w-full items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-center text-meta leading-snug text-text-secondary">
                  <PeopleIcon size={14} />
                  {footer}
                </p>
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      <style>{`
        .lb-stone {
          background: linear-gradient(180deg, rgba(38, 36, 42, 0.94) 0%, rgba(20, 19, 24, 0.96) 100%);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            inset 0 -2px 0 rgba(0, 0, 0, 0.4),
            0 14px 30px -12px rgba(255, 90, 44, 0.45);
        }
      `}</style>
    </main>
  );
}

function Header({ scope, headingRef }: { scope: Scope; headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <HubHeader
      title="Leaderboard"
      subtitle={[scope === "friends" ? "Friends" : "Global", "All time"]}
      trailing={<TrophyBadge />}
      headingRef={headingRef}
    />
  );
}

/** Global | Friends segmented control (WAI-ARIA tabs: arrow keys move between scopes). */
function ScopeTabs({ scope, onChange }: { scope: Scope; onChange: (next: Scope) => void }) {
  const select = (next: Scope) => {
    if (next === scope) return;
    void tapLight();
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = SCOPES.findIndex((s) => s.id === scope);
    const next = SCOPES[(i + (e.key === "ArrowRight" ? 1 : SCOPES.length - 1)) % SCOPES.length].id;
    select(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Leaderboard scope"
      onKeyDown={onKeyDown}
      className="glass mb-5 grid grid-cols-2 gap-1 rounded-full border border-white/10 p-1"
    >
      {SCOPES.map(({ id, label }) => {
        const selected = id === scope;
        return (
          <button
            key={id}
            id={tabId(id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(id)}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-full font-display text-meta font-black uppercase tracking-chip transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
              selected
                ? "bg-signal text-void shadow-[0_0_18px_-4px_rgba(203,242,77,0.6)]"
                : "text-text-secondary active:bg-white/5"
            }`}
          >
            {id === "global" ? <GlobeIcon /> : <PeopleIcon />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

const HEX_BADGE_SIZE = { md: "h-11 w-11", lg: "h-14 w-14" } as const;

/** Signal-rimmed hex holding a lime icon (ranked banner, "Race your friends" card). */
function HexIconBadge({ size, children }: { size: keyof typeof HEX_BADGE_SIZE; children: ReactNode }) {
  return (
    <span className={`hex flex ${HEX_BADGE_SIZE[size]} shrink-0 items-center justify-center bg-signal/80 p-[2px]`}>
      <span className="hex flex h-full w-full items-center justify-center bg-[#15170f] text-signal">{children}</span>
    </span>
  );
}

/** Friends tab with no one else on it: point at where friends are added. */
/** Global board with no climbs: invite the first climb instead of a dead end. */
function EmptyGlobalBoard() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-4 pb-4">
      <StateMessage>No climbs yet. Be the first to the top.</StateMessage>
      <Button fullWidth={false} onPress={() => navigate("/climb")}>
        Play
      </Button>
    </div>
  );
}

function RaceFriendsCard() {
  const navigate = useNavigate();
  return (
    <section className="glass mb-4 flex flex-col items-center gap-3 rounded-3xl border border-white/10 px-6 py-8 text-center">
      <HexIconBadge size="lg">
        <PeopleIcon size={24} />
      </HexIconBadge>
      <h2 className="font-display text-name font-black uppercase leading-none tracking-tight text-text-primary">
        Race your friends
      </h2>
      <p className="max-w-[18rem] text-meta leading-relaxed text-text-secondary">
        Add friends to see how your best climb stacks up against theirs.
      </p>
      <Button fullWidth={false} onPress={() => navigate("/challenge")}>
        Find friends
      </Button>
    </section>
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
          <HexAvatar
            userId={climber.userId}
            name={climber.handle}
            avatarId={climber.avatarId}
            size={isFirst ? 68 : 56}
          />
        ) : (
          <span
            className="hex flex items-center justify-center bg-elevated/80 text-text-muted"
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
            {/* Three lines hold a 60-character display name (MAX_NAME) at 320px without
                stretching the column. A longer wrap ends in an ellipsis; the title carries
                the full name, and screen readers read the full text regardless. */}
            <p
              title={climber.handle}
              className="line-clamp-3 break-words font-display text-meta font-bold leading-tight text-text-primary"
            >
              {climber.handle}
            </p>
            {isMe && (
              <p className="mt-0.5 font-display text-label font-black uppercase tracking-chip text-signal">
                You
              </p>
            )}
            <span className={`mx-auto mt-1.5 block h-px w-4/5 ${isFirst ? "bg-signal/25" : "bg-white/10"}`} />
            <p
              className={`mt-1.5 font-display font-black leading-none tabular-nums ${
                isFirst ? "text-body text-signal" : "text-meta text-text-primary"
              }`}
            >
              {climber.peakY.toLocaleString()}
              <span className="ml-0.5 text-[0.7em] font-bold text-text-secondary">{ALTITUDE_UNIT}</span>
            </p>
          </>
        ) : (
          <p className="pt-2 font-mono text-label uppercase tracking-label text-text-muted">Open</p>
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
          className={`block font-display text-headline font-black uppercase tracking-tight ${ranked ? "text-signal" : "text-text-primary"}`}
        >
          {headline}
        </span>
        {/* Wraps rather than truncates: the hidden/unranked detail is the recovery step. */}
        <span className="mt-1 block text-meta leading-snug text-text-secondary">{detail}</span>
      </span>
      {!ranked && <ChevronRight />}
      {ranked && (
        <HexIconBadge size="md">
          <ChevronUp />
        </HexIconBadge>
      )}
    </>
  );

  const className = `${ranked ? "glow-card" : "glass border border-white/10"} flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left`;

  const action =
    standing.kind === "hidden"
      ? { label: "Edit profile", run: () => navigate("/profile/edit") }
      : standing.kind === "unranked"
        ? { label: "Play", run: () => navigate("/climb") }
        : meRowId
          ? {
              label: "Show my row",
              run: () =>
                document
                  .getElementById(meRowId)
                  ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" }),
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
    <section className="glass rounded-3xl border border-white/10 p-2" aria-label="Rankings">
      <div className="flex items-center gap-2.5 pb-2 pl-2 pr-3 pt-1.5 font-mono text-label font-bold uppercase tracking-label text-text-muted">
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
              className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border py-2 pl-2 pr-3 ${
                isMe ? "border-signal/50 bg-signal/[0.09]" : "border-white/[0.06] bg-white/[0.025]"
              }`}
            >
              <span className="w-6 text-center font-display text-base font-black tabular-nums text-text-secondary">
                {c.rank}
              </span>
              <HexAvatar userId={c.userId} name={c.handle} avatarId={c.avatarId} size={38} />
              {/* Wraps, never clamps: at 320px or a large text size the longest
                  pseudonym needs more than one line, and a clamp would cut it. YOU
                  sits on its own line, as on the podium, so it never pushes the
                  name onto an extra one. The row centres its items, so the rank and
                  height columns stay aligned when the name wraps. Below a 5.5rem
                  name column (320px at a large text size) the height wraps onto
                  its own line instead of the name breaking mid-word. */}
              <span className="flex min-w-[5.5rem] flex-1 flex-col">
                <span className="break-words text-balance font-display text-meta font-bold leading-tight text-text-primary min-[375px]:text-body">
                  {c.handle}
                </span>
                {isMe && <span className="mt-0.5 font-mono text-label uppercase tracking-label text-signal">you</span>}
              </span>
              <span className="ml-auto shrink-0 font-sans text-meta font-medium tabular-nums text-text-secondary">
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

function MedalBadge({ place, className = "" }: { place: Medal; className?: string }) {
  const m = MEDAL[place];
  const size = place === 1 ? 40 : 34;
  return (
    <span
      className={`hex relative z-10 flex items-center justify-center ${className}`}
      style={{ width: size, height: size, background: m.rim, padding: 2 }}
    >
      <span
        className="hex flex h-full w-full items-center justify-center font-display font-black"
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
    <svg width="26" height="29" viewBox="0 0 36 40" aria-hidden className="drop-shadow-[0_0_10px_rgba(245,184,46,0.45)]">
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

function GlobeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function PeopleIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </svg>
  );
}
