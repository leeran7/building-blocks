import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLevels } from "../contexts/LevelsContext";
import { tapHeavy, tapLight } from "../lib/haptics";
import { Button } from "../components/ui";
import { LevelStartSheet } from "../components/levels/LevelStartSheet";
import { useLivesRefillOffer } from "../components/levels/useLivesRefillOffer";
import { LevelStartExtras } from "../components/levels/LevelStartExtras";
import { BoosterPicker, ChestMeter } from "../components/levels/LevelChests";
import { LivesPill, StarRow, XpBar, useWhenDue } from "../components/levels/LevelBits";
import {
  EPISODE_SIZE,
  episodeOf,
  isHardLevel,
  type LevelNode,
  type StartResult,
} from "../lib/levels/model";
import { startBoosterTypes, type BoosterType } from "@app/levels/engagement";
import { needsOnboarding, wantsTour } from "../lib/onboarding";
import { AppTour } from "../components/onboarding/AppTour";
import { MAP_TOUR } from "../components/onboarding/mapTour";

/** Vertical distance between two pins, px. */
const ROW = 92;
/** Extra room at each episode boundary for its banner, px. */
const EPISODE_GAP = 60;
/** Space under level 1 for the Play bar, px. */
const BOTTOM_PAD = 150;
/** Space above the last shown pin for the "more levels" fade, px. */
const TOP_PAD = 140;
/** Locked levels shown above the frontier before the map fades out. */
const LOOKAHEAD = 10;
/**
 * Fades the map out behind the Play bar, so pins never run under Play and the
 * bar needs no dark scrim of its own: the backdrop's lava shows through down
 * to the tab bar. Clear under the 68px bar (pb-3 + the 56px buttons), solid
 * from 112px up, which keeps level 1 (BOTTOM_PAD) fully visible.
 */
export const MAP_FADE = "linear-gradient(to top, transparent 56px, #000 112px)";

/** Pin centre from the map's bottom edge, px. */
export function pinBottom(level: number): number {
  return BOTTOM_PAD + (level - 1) * ROW + (episodeOf(level) - 1) * EPISODE_GAP;
}

/** Pin centre across the map, % of its width: a gentle winding trail. */
export function pinX(level: number): number {
  return 50 + 28 * Math.sin((level - 1) * 0.85);
}

/**
 * The home screen: a Candy Crush style map of numbered levels, climbing from
 * level 1 at the bottom. Cleared levels show their stars, the frontier pin
 * pulses, Hard levels glow ember, and later levels are locked. Tapping an
 * open pin opens the level start card; Endless (the endless climb) sits
 * beside the Play bar.
 */
export function LevelMapScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { client, season, loading, error, refresh, setPlayer } = useLevels();
  const refill = useLivesRefillOffer();
  const [selected, setSelectedNode] = useState<LevelNode | null>(null);
  // The booster equipped on the open start card; every card opens without one.
  const [booster, setBooster] = useState<BoosterType | null>(null);
  const setSelected = useCallback((node: LevelNode | null) => {
    setBooster(null);
    setSelectedNode(node);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<number | null>(null);

  const refreshQuietly = useCallback(() => void refresh(), [refresh]);
  useWhenDue(season?.player.nextLifeAt ?? null, refreshQuietly);

  const frontier = season?.frontier ?? 1;
  const shownTop = season ? Math.min(season.levels.length, frontier + LOOKAHEAD) : 0;
  const height = shownTop > 0 ? pinBottom(shownTop) + TOP_PAD : 0;

  // Open on the frontier, once per frontier, so a new clear scrolls to the next pin.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !season || scrolledFor.current === frontier) return;
    scrolledFor.current = frontier;
    el.scrollTop = Math.max(0, height - pinBottom(frontier) - el.clientHeight * 0.55);
  }, [season, frontier, height]);

  // "Next level" on a result card lands here with the next level's card open.
  const openLevel = openLevelFromState(location.state);
  useLayoutEffect(() => {
    if (!season || openLevel === null) return;
    navigate(".", { replace: true, state: null });
    if (openLevel <= season.frontier) setSelected(season.levels[openLevel - 1]);
  }, [season, openLevel, navigate, setSelected]);

  const startLevel = useCallback(
    async (level: number, equipped: BoosterType | null) => {
      let res: StartResult;
      try {
        res = await client.startLevel(level, { booster: equipped });
      } catch {
        return { ok: false as const, code: "NETWORK" as const };
      }
      if (res.ok) {
        void tapHeavy();
        setPlayer(res.ticket.player);
        // A spent booster leaves the inventory: reload it for the map.
        if (res.ticket.startPowerUp?.source === "booster") void refresh();
        navigate(`/levels/${level}/play`, { state: { ticket: res.ticket } });
        return res;
      }
      if (res.player) setPlayer(res.player);
      if (res.code === "BOOSTER_UNAVAILABLE") {
        // The inventory on screen was stale: reload it and unequip.
        setBooster(null);
        void refresh();
      }
      return res;
    },
    [client, navigate, setPlayer, refresh],
  );

  // First launch: the training climb, which comes back here with the tour.
  const firstRun = season !== null && needsOnboarding(season.frontier);
  useLayoutEffect(() => {
    if (firstRun) navigate("/tutorial", { replace: true });
  }, [firstRun, navigate]);
  const [touring, setTouring] = useState(false);
  const tourRequested = wantsTour(location.state);
  useLayoutEffect(() => {
    if (!season || !tourRequested) return;
    navigate(".", { replace: true, state: null });
    setTouring(true);
  }, [season, tourRequested, navigate]);
  const endTour = useCallback(
    (finished: boolean) => {
      setTouring(false);
      // The last step's button opens the next level.
      if (finished && season) setSelected(season.levels[season.frontier - 1]);
    },
    [season, setSelected],
  );

  const loadBoard = useCallback((level: number) => client.getBoard(level), [client]);

  const openPractice = useCallback(() => {
    void tapHeavy();
    navigate("/climb");
  }, [navigate]);

  if (!season) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        {error && !loading ? (
          <>
            <p className="text-body text-text-secondary">Couldn&rsquo;t load the level map.</p>
            <div className="w-full max-w-xs">
              <Button onPress={() => void refresh()}>Try again</Button>
            </div>
            <Button variant="ghost" onPress={openPractice}>Play Endless</Button>
          </>
        ) : (
          <p role="status" className="font-mono text-label uppercase tracking-label text-text-muted">
            Loading levels…
          </p>
        )}
      </main>
    );
  }

  const shown = season.levels.slice(0, shownTop);
  const current = season.levels[frontier - 1];
  const episode = episodeOf(frontier);

  return (
    <main className="relative flex h-full flex-col">
      <header className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-void via-void/80 to-transparent px-4 pb-8 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between gap-2">
          <span data-tour="lives" className="inline-flex">
            <LivesPill player={season.player} />
          </span>
          <span data-tour="xp" className="inline-flex">
            <XpBar player={season.player} compact />
          </span>
        </div>
        <p className="mt-2.5 text-center font-mono text-label uppercase tracking-eyebrow text-text-secondary">
          {season.name} · Episode {episode}
        </p>
        {season.chests && (
          <div data-tour="chest" className="mx-auto mt-2 flex w-fit justify-center">
            <ChestMeter chests={season.chests} boosters={season.boosters} />
          </div>
        )}
      </header>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto"
        style={{
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          maskImage: MAP_FADE,
          WebkitMaskImage: MAP_FADE,
        }}
      >
        <div className="relative mx-auto w-full max-w-md" style={{ height }}>
          <Trail levels={shown.length} frontier={frontier} height={height} />
          <ol aria-label={`${season.name} levels`} className="absolute inset-0">
          {Array.from({ length: Math.floor((shownTop - 1) / EPISODE_SIZE) }, (_, i) => {
            const first = (i + 1) * EPISODE_SIZE + 1;
            return <EpisodeBanner key={first} episode={i + 2} bottom={pinBottom(first) - ROW / 2 - EPISODE_GAP / 2} />;
          })}
          {shown.map((node) => (
            <LevelPin
              key={node.level}
              node={node}
              tour={node.level === frontier}
              state={node.level === frontier && node.stars === 0 ? "current" : node.level > frontier ? "locked" : "open"}
              onOpen={() => {
                void tapLight();
                setSelected(node);
              }}
            />
          ))}
          {shownTop < season.levels.length && (
            <li
              aria-hidden
              className="absolute inset-x-0 top-0 flex h-32 items-start justify-center bg-gradient-to-b from-void to-transparent pt-24 font-mono text-label uppercase tracking-label text-text-muted"
            >
              {season.levels.length - shownTop} more levels
            </li>
          )}
          </ol>
        </div>
      </div>

      {/* Clear bar: no scrim, so the lava crest shows behind it. MAP_FADE
          fades the pins out before they reach it. */}
      <div data-play-bar className="absolute inset-x-0 bottom-0 z-20 flex items-stretch gap-2.5 px-4 pb-3">
        <button
          type="button"
          onClick={() => {
            void tapLight();
            setSelected(current);
          }}
          data-tour="play"
          aria-label={`Open level ${current.level}`}
          className="cta-lime flex min-h-[56px] flex-1 items-center justify-center gap-3 rounded-[22px] px-4 text-void transition-transform active:scale-[0.97]"
        >
          <span className="font-display text-cta font-black uppercase">Play</span>
          <span className="rounded-lg bg-void/15 px-2 py-0.5 font-mono text-label font-bold uppercase tracking-label">
            Level {current.level}
          </span>
        </button>
        <button
          type="button"
          onClick={openPractice}
          data-tour="endless"
          aria-label="Endless, climb as high as you can"
          className="glass flex min-h-[56px] flex-col items-center justify-center rounded-[22px] border border-white/10 px-4 transition-transform active:scale-[0.97]"
        >
          <InfinityIcon />
          <span className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-label text-text-secondary">
            Endless
          </span>
        </button>
      </div>

      {selected && (
        <LevelStartSheet
          node={selected}
          player={season.player}
          onStart={() => startLevel(selected.level, booster)}
          onPractice={openPractice}
          onPracticeLevel={() => {
            void tapHeavy();
            navigate(`/levels/${selected.level}/play?practice=1`);
          }}
          onClose={() => setSelected(null)}
          refill={refill.offer}
          extras={
            <LevelStartExtras
              atFrontier={selected.level === frontier}
              streak={season.streak}
              startPowerUp={selected.level === frontier ? season.nextStartPowerUp : null}
              stuck={selected.level === season.stuck.level ? season.stuck : null}
              board={{ level: selected.level, load: loadBoard }}
              boosters={
                // Out of lives the card offers the wait and the refill instead.
                selected.costsLife && season.player.lives <= 0 ? null : (
                <BoosterPicker
                  inventory={season.boosters}
                  allowed={startBoosterTypes(selected.level, selected.allowedPowerUps)}
                  selected={booster}
                  onSelect={setBooster}
                  freeStart={selected.level === frontier && season.nextStartPowerUp !== null}
                />
                )
              }
            />
          }
        />
      )}
      {refill.overlays}
      {touring && <AppTour steps={MAP_TOUR} onClose={endTour} finishLabel={`Play level ${current.level}`} />}
    </main>
  );
}

function openLevelFromState(state: unknown): number | null {
  if (typeof state !== "object" || state === null || !("openLevel" in state)) return null;
  const n = (state as { openLevel: unknown }).openLevel;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : null;
}

type PinState = "open" | "current" | "locked";

function LevelPin({
  node,
  state,
  tour,
  onOpen,
}: {
  node: LevelNode;
  state: PinState;
  /** The pin the first-run tour points at. */
  tour: boolean;
  onOpen: () => void;
}) {
  const hard = isHardLevel(node.level);
  const locked = state === "locked";
  const current = state === "current";
  const size = current ? 72 : 60;
  const label = locked
    ? `Level ${node.level}, locked`
    : `Level ${node.level}${hard ? ", hard" : ""}${node.stars > 0 ? `, ${node.stars} of 3 stars` : current ? ", next to play" : ""}`;

  const face = locked
    ? "border-white/10 bg-surface/80 text-text-disabled"
    : current
      ? "border-signal bg-signal text-void shadow-[0_0_0_6px_rgba(203,242,77,0.18),0_10px_30px_-6px_rgba(203,242,77,0.55)]"
      : hard
        ? "border-ember bg-[#2a1410] text-text-primary shadow-ember"
        : "border-signal/60 bg-elevated text-text-primary";

  return (
    <li
      className="absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
      style={{ left: `${pinX(node.level)}%`, bottom: pinBottom(node.level) }}
    >
      <button
        type="button"
        disabled={locked}
        data-tour={tour ? "next-level" : undefined}
        aria-label={label}
        aria-current={current ? "step" : undefined}
        onClick={onOpen}
        style={{ width: size, height: size }}
        className={`relative flex items-center justify-center rounded-full border-[3px] font-display font-black tabular-nums transition-transform active:scale-90 disabled:active:scale-100 ${current ? "lm-pulse text-headline" : "text-lead"} ${face}`}
      >
        {locked ? <LockIcon /> : node.level}
        {hard && !locked && (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-void bg-ember">
            <SkullIcon />
          </span>
        )}
      </button>
      {locked ? (
        <span aria-hidden className="mt-1 font-mono text-label font-bold tabular-nums text-text-disabled">{node.level}</span>
      ) : node.stars > 0 ? (
        <StarRow count={node.stars} size={15} className="mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      ) : null}
      <style>{`
        .lm-pulse { animation: lmPulse 1.6s ease-in-out infinite; }
        @keyframes lmPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.07); }
        }
        @media (prefers-reduced-motion: reduce) { .lm-pulse { animation: none; } }
      `}</style>
    </li>
  );
}

/** The path joining the pins: lit up to the frontier, dashed beyond it. */
function Trail({ levels, frontier, height }: { levels: number; frontier: number; height: number }) {
  const point = (n: number) => `${pinX(n).toFixed(2)} ${(height - pinBottom(n)).toFixed(1)}`;
  const path = (from: number, to: number) => {
    const parts: string[] = [];
    for (let n = from; n <= to; n++) parts.push(`${n === from ? "M" : "L"} ${point(n)}`);
    return parts.join(" ");
  };
  const lit = Math.min(frontier, levels);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
    >
      {levels > lit && (
        <path d={path(lit, levels)} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={5} strokeDasharray="2 12" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      )}
      {lit > 1 && (
        <path d={path(1, lit)} fill="none" stroke="rgba(203,242,77,0.55)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

function EpisodeBanner({ episode, bottom }: { episode: number; bottom: number }) {
  return (
    <li aria-hidden className="absolute inset-x-6 flex items-center gap-3" style={{ bottom }}>
      <span className="h-px flex-1 bg-white/15" />
      <span className="glass rounded-full border border-white/10 px-3 py-1 font-mono text-label font-bold uppercase tracking-label text-text-secondary">
        Episode {episode}
      </span>
      <span className="h-px flex-1 bg-white/15" />
    </li>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function SkullIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-void" aria-hidden>
      <path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.6 1.2 4.6 3 5.9V19a1 1 0 0 0 1 1h1.5v-2h2v2h2v-2h2v2h1.5a1 1 0 0 0 1-1v-2.9c1.8-1.3 3-3.3 3-5.9C20.5 5.6 17 2 12 2Zm-3.5 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
    </svg>
  );
}

function InfinityIcon() {
  return (
    <svg width="26" height="18" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="text-signal" aria-hidden>
      <path d="M16 10c-3-4-5.5-6-8.5-6a6 6 0 0 0 0 12c3 0 5.5-2 8.5-6Zm0 0c3 4 5.5 6 8.5 6a6 6 0 0 0 0-12c-3 0-5.5 2-8.5 6Z" />
    </svg>
  );
}
