import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLevels } from "../contexts/LevelsContext";
import { tapHeavy, tapLight } from "../lib/haptics";
import { Button } from "../components/ui";
import { LevelStartSheet } from "../components/levels/LevelStartSheet";
import { useLivesRefillOffer } from "../components/levels/useLivesRefillOffer";
import { LevelStartExtras } from "../components/levels/LevelStartExtras";
import { BoosterPicker, ChestMeter } from "../components/levels/LevelChests";
import { LivesPill, XpBar, useWhenDue } from "../components/levels/LevelBits";
import { TowerMap } from "../components/levels/TowerMap";
import { pinBottom, towerHeight } from "../components/levels/towerGeometry";
import { useEquippedAvatar } from "../contexts/AppDataContext";
import { episodeOf, type LevelNode, type StartResult } from "../lib/levels/model";
import { startBoosterTypes, type BoosterType } from "@app/levels/engagement";

// The map's geometry lives with its drawing; this stays importable from the screen.
export { pinBottom } from "../components/levels/towerGeometry";

/** Locked floors shown above the frontier before the map fades out. */
const LOOKAHEAD = 10;
/**
 * Fades the map out behind the Play bar, so floors never run under Play and
 * the bar needs no dark scrim of its own: the backdrop's lava shows through
 * down to the tab bar. Clear under the 68px bar (pb-3 + the 56px buttons),
 * solid from 112px up, which keeps floor 1 (BOTTOM_PAD) fully visible.
 */
export const MAP_FADE = "linear-gradient(to top, transparent 56px, #000 112px)";

/**
 * The home screen: the season's levels drawn as the tower (TowerMap), climbing
 * from level 1 at the bottom. This screen owns the data, the scroll position
 * and the layout around the map: the header, the Play bar and the level start
 * card. Tapping an open floor opens its start card; Endless (the endless
 * climb) sits beside Play.
 */
export function LevelMapScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { client, season, loading, error, refresh, setPlayer } = useLevels();
  const refill = useLivesRefillOffer();
  const avatar = useEquippedAvatar();
  const [selected, setSelectedNode] = useState<LevelNode | null>(null);
  // The booster equipped on the open start card; every card opens without one.
  const [booster, setBooster] = useState<BoosterType | null>(null);
  const setSelected = useCallback((node: LevelNode | null) => {
    setBooster(null);
    setSelectedNode(node);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  // The fixed header's height (notch inset included), px; null until measured.
  // The map is padded by it so the top of the tower scrolls clear of it.
  const [headerH, setHeaderH] = useState<number | null>(null);

  const refreshQuietly = useCallback(() => void refresh(), [refresh]);
  useWhenDue(season?.player.nextLifeAt ?? null, refreshQuietly);

  const frontier = season?.frontier ?? 1;
  const shownTop = season ? Math.min(season.levels.length, frontier + LOOKAHEAD) : 0;
  const height = towerHeight(shownTop);

  // Measured before the first scroll below, so the frontier lands where it would without the pad.
  const hasHeader = season !== null;
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasHeader]);

  // Open on the frontier, once per frontier, so a new clear scrolls to the next floor.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !season || headerH === null || scrolledFor.current === frontier) return;
    scrolledFor.current = frontier;
    el.scrollTop = Math.max(0, headerH + height - pinBottom(frontier) - el.clientHeight * 0.55);
  }, [season, frontier, height, headerH]);

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

  const openFloor = useCallback(
    (node: LevelNode) => {
      void tapLight();
      setSelected(node);
    },
    [setSelected],
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
      <header ref={headerRef} className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-void via-void/80 to-transparent px-4 pb-8 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between gap-2">
          <LivesPill player={season.player} />
          <XpBar player={season.player} compact />
        </div>
        <p className="mt-2.5 text-center font-mono text-label uppercase tracking-eyebrow text-text-secondary">
          {season.name} · Episode {episode}
        </p>
        {season.chests && (
          <div className="mt-2 flex justify-center">
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
          paddingTop: headerH ?? 0,
        }}
      >
        <TowerMap
          seasonName={season.name}
          levels={shown}
          frontier={frontier}
          floorsAbove={season.levels.length - shownTop}
          height={height}
          avatar={avatar}
          onOpen={openFloor}
        />
      </div>

      {/* Clear bar: no scrim, so the lava crest shows behind it. MAP_FADE
          fades the floors out before they reach it. */}
      <div data-play-bar className="absolute inset-x-0 bottom-0 z-20 flex items-stretch gap-2.5 px-4 pb-3">
        <button
          type="button"
          onClick={() => {
            void tapLight();
            setSelected(current);
          }}
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
    </main>
  );
}

function openLevelFromState(state: unknown): number | null {
  if (typeof state !== "object" || state === null || !("openLevel" in state)) return null;
  const n = (state as { openLevel: unknown }).openLevel;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : null;
}

function InfinityIcon() {
  return (
    <svg width="26" height="18" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="text-signal" aria-hidden>
      <path d="M16 10c-3-4-5.5-6-8.5-6a6 6 0 0 0 0 12c3 0 5.5-2 8.5-6Zm0 0c3 4 5.5 6 8.5 6a6 6 0 0 0 0-12c-3 0-5.5 2-8.5 6Z" />
    </svg>
  );
}
