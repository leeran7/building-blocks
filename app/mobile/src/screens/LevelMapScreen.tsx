import { AnimatePresence } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLevels } from "../contexts/LevelsContext";
import { tapHeavy, tapLight } from "../lib/haptics";
import { Button } from "../components/ui";
import { LevelStartSheet } from "../components/levels/LevelStartSheet";
import { LivesSheet } from "../components/levels/LivesSheet";
import { GemBalance } from "../components/store/GemBalance";
import { useOptionalShop } from "../contexts/ShopContext";
import { useLivesRefillOffer } from "../components/levels/useLivesRefillOffer";
import { LevelStartExtras } from "../components/levels/LevelStartExtras";
import { BoosterPicker, ChestMeter } from "../components/levels/LevelChests";
import { LivesPill, XpBar, useWhenDue } from "../components/levels/LevelBits";
import { TowerMap } from "../components/levels/TowerMap";
import { pinBottom, towerHeight } from "../components/levels/towerGeometry";
import { useEquippedAvatar } from "../contexts/AppDataContext";
import { episodeOf, type LevelNode, type StartResult } from "../lib/levels/model";
import { startBoosterTypes, type BoosterType } from "@app/levels/engagement";
import { isTicketLive, mapLanding, noteRunStarted, runNoticeFor, type RunNotice } from "../lib/levels/runNote";
import { accountOnboarding, guestOnboarding, wantsTour } from "../lib/onboarding";
import { AppTour } from "../components/onboarding/AppTour";
import { GUEST_MAP_TOUR, MAP_TOUR } from "../components/onboarding/mapTour";
import { useGuest, GUEST_MAP_PATH } from "../contexts/GuestContext";
import { GUEST_LEVEL_CAP, isGuestLocked } from "../lib/levels/guestClient";
import { GuestSignInSheet } from "../components/GuestSignInSheet";

// The map's geometry lives with its drawing; this stays importable from the screen.
export { pinBottom } from "../components/levels/towerGeometry";

/** Locked floors shown above the frontier before the map fades out. */
const LOOKAHEAD = 10;
/** Height of the Play bar: pb-3 (12px) under the 56px buttons, px. */
const PLAY_BAR_HEIGHT = 68;
/** Gap between the Play bar and the run notice banner above it, px. */
const NOTICE_GAP = 16;
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
 *
 * A guest gets the same map for the taster (GuestShell): levels above
 * GUEST_LEVEL_CAP stay locked and ask them to sign in, and the account-only
 * parts (star chest, gems, friends board, tab tour) are left out.
 */
export function LevelMapScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { client, season, loading, error, refresh, setPlayer, runNotes } = useLevels();
  const guest = useGuest();
  const lockedForGuest = useCallback((level: number) => guest !== null && isGuestLocked(level), [guest]);
  const [signInPrompt, setSignInPrompt] = useState(false);
  const refill = useLivesRefillOffer();
  // The gem pill needs the Shop's balance; without a ShopProvider it is left out.
  const hasShop = useOptionalShop() !== null;
  const [livesOpen, setLivesOpen] = useState(false);
  const avatar = useEquippedAvatar();
  const [selected, setSelectedNode] = useState<LevelNode | null>(null);
  // The booster equipped on the open start card; every card opens without one.
  const [booster, setBooster] = useState<BoosterType | null>(null);
  // An interrupted run's one-line notice: on its level's card, else on the map.
  const [notice, setNotice] = useState<RunNotice | null>(null);
  const setSelected = useCallback((node: LevelNode | null) => {
    setBooster(null);
    setNotice(null);
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

  // "Next level" on a result card lands here with the next level's card open,
  // and so does a level run that lost its ticket (marked `interrupted`).
  const openLevel = openLevelFromState(location.state);
  const interrupted = interruptedFromState(location.state);
  // Once per history entry: a note left by an earlier session (the launch
  // after a restart) or by the bounced run is said once, then forgotten. A
  // re-run for the same entry (a season refresh, StrictMode's dev re-run) does
  // nothing, so it cannot reopen the card and wipe the notice just shown.
  const noticeCheckedKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!season || noticeCheckedKey.current === location.key) return;
    noticeCheckedKey.current = location.key;
    const verdict = runNoticeFor({ note: runNotes.get(), season: season.season, bounced: interrupted, live: isTicketLive });
    if (verdict.consume) runNotes.take();
    if (openLevel !== null || interrupted) navigate(".", { replace: true, state: null });
    // A guest's "Next level" past the taster asks them to sign in.
    if (openLevel !== null && lockedForGuest(openLevel)) {
      setSignInPrompt(true);
      return;
    }
    const landing = mapLanding({ notice: verdict.notice, openLevel, bounced: interrupted, frontier: season.frontier });
    if (landing.open !== null) setSelected(season.levels[landing.open - 1]);
    if (landing.notice) setNotice(landing.notice);
  }, [season, openLevel, interrupted, location.key, navigate, setSelected, runNotes, lockedForGuest]);

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
        // Noted before the run, so a reload or restart mid-run is mentioned later.
        const node = season?.levels[level - 1];
        noteRunStarted(runNotes, res.ticket.id, season && node ? { season: season.season, level, costsLife: node.costsLife } : null);
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
    [client, navigate, setPlayer, refresh, season, runNotes],
  );

  // First launch: the training climb, which comes back here with the tour.
  // A guest has their own flag, so signing in later still brings the tour.
  const onboarding = guest ? guestOnboarding : accountOnboarding;
  const firstRun = season !== null && onboarding.needs(season.frontier);
  useLayoutEffect(() => {
    if (!firstRun) return;
    onboarding.markOffered();
    navigate("/tutorial", { replace: true, state: guest ? { then: GUEST_MAP_PATH } : null });
  }, [firstRun, navigate, onboarding, guest]);
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
      if (!finished || !season) return;
      if (lockedForGuest(season.frontier)) setSignInPrompt(true);
      else setSelected(season.levels[season.frontier - 1]);
    },
    [season, setSelected, lockedForGuest],
  );
  const openNext = useCallback(
    (node: LevelNode) => {
      void tapLight();
      if (lockedForGuest(node.level)) setSignInPrompt(true);
      else setSelected(node);
    },
    [lockedForGuest, setSelected],
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
        {guest && <GuestMapBar onHome={() => navigate("/")} onSignIn={guest.onSignIn} />}
        <div className="flex items-center justify-between gap-2">
          <span data-tour="lives" className="inline-flex">
            <LivesPill
              player={season.player}
              // Only a client that sells refills makes the pill a button.
              onPress={
                refill.offer
                  ? () => {
                      void tapLight();
                      setLivesOpen(true);
                    }
                  : undefined
              }
            />
          </span>
          <span data-tour="xp" className="inline-flex">
            <XpBar player={season.player} compact />
          </span>
        </div>
        <p className="mt-2.5 text-center font-mono text-label uppercase tracking-eyebrow text-text-secondary">
          {season.name} · Episode {episode}
        </p>
        {/* The economy row: the star chest and the gem balance. A third pill
            in the row above does not fit a 375pt-wide phone. Wraps on narrower ones. */}
        {!guest && (season.chests || hasShop) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {season.chests && (
              <div data-tour="chest" className="flex w-fit justify-center">
                <ChestMeter chests={season.chests} boosters={season.boosters} />
              </div>
            )}
            {hasShop && (
              <span data-tour="gems" className="inline-flex">
                <GemBalance compact />
              </span>
            )}
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
          onOpen={openNext}
          signInLocked={guest ? lockedForGuest : undefined}
          onSignIn={openNext}
        />
      </div>

      {notice && (notice.level === null || selected?.level !== notice.level) && (
        <MapNotice text={notice.text} onDismiss={() => setNotice(null)} />
      )}

      {/* Clear bar: no scrim, so the lava crest shows behind it. MAP_FADE
          fades the floors out before they reach it. */}
      <div data-play-bar className="absolute inset-x-0 bottom-0 z-20 flex items-stretch gap-2.5 px-4 pb-3">
        <button
          type="button"
          onClick={() => openNext(current)}
          data-tour="play"
          aria-label={lockedForGuest(current.level) ? `Sign in to play level ${current.level}` : `Open level ${current.level}`}
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

      <AnimatePresence>
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
            notice={notice && notice.level === selected.level ? notice.text : null}
            refill={refill.offer}
            extras={
              <LevelStartExtras
                atFrontier={selected.level === frontier}
                streak={season.streak}
                startPowerUp={selected.level === frontier ? season.nextStartPowerUp : null}
                stuck={selected.level === season.stuck.level ? season.stuck : null}
                board={guest ? null : { level: selected.level, load: loadBoard }}
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
      </AnimatePresence>
      <AnimatePresence>
        {livesOpen && refill.offer && (
          <LivesSheet player={season.player} offer={refill.offer} onClose={() => setLivesOpen(false)} />
        )}
      </AnimatePresence>
      {refill.overlays}
      {touring && (
        <AppTour
          steps={guest ? GUEST_MAP_TOUR : MAP_TOUR}
          onClose={endTour}
          finishLabel={lockedForGuest(current.level) ? "Got it" : `Play level ${current.level}`}
        />
      )}
      <AnimatePresence>
        {signInPrompt && guest && (
          <GuestSignInSheet
            // Only a guest past the taster has done it; any locked pin opens this.
            eyebrow={frontier > GUEST_LEVEL_CAP ? `Levels 1–${GUEST_LEVEL_CAP} done` : `Levels 1–${GUEST_LEVEL_CAP} are free`}
            title="Unlock all 300 levels"
            body="Sign in to keep your stars from here on, play every level, add friends and save your scores. Guest stars stay on this device."
            onSignIn={guest.onSignIn}
            onClose={() => setSignInPrompt(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function openLevelFromState(state: unknown): number | null {
  if (typeof state !== "object" || state === null || !("openLevel" in state)) return null;
  const n = (state as { openLevel: unknown }).openLevel;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : null;
}

/** Whether the map was reached from a level run that had no ticket. */
export function interruptedFromState(state: unknown): boolean {
  if (typeof state !== "object" || state === null || !("interrupted" in state)) return false;
  return (state as { interrupted: unknown }).interrupted === true;
}

/** An interrupted run's notice when no level card shows it. */
function MapNotice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div
      style={{ bottom: PLAY_BAR_HEIGHT + NOTICE_GAP }}
      className="absolute inset-x-4 z-30 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-ember/40 bg-surface/95 py-1 pl-4 pr-1 backdrop-blur-xl"
    >
      <p role="status" className="flex-1 text-meta text-text-primary">
        {text}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-transform active:scale-90"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

/** The guest's way back to guest home, and to Sign In (no tab bar here). */
function GuestMapBar({ onHome, onSignIn }: { onHome: () => void; onSignIn: () => void }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <button
        type="button"
        onClick={() => {
          void tapLight();
          onHome();
        }}
        aria-label="Back to guest home"
        className="-ml-2 flex min-h-[44px] items-center gap-1 rounded-full px-2 font-mono text-label uppercase tracking-label text-text-secondary active:scale-95"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
        Home
      </button>
      <button
        type="button"
        onClick={() => {
          void tapLight();
          onSignIn();
        }}
        className="min-h-[44px] rounded-full border border-border-strong bg-surface/70 px-4 font-mono text-[11px] uppercase tracking-[0.15em] text-signal transition-transform active:scale-95"
      >
        Sign In
      </button>
    </div>
  );
}

function InfinityIcon() {
  return (
    <svg width="26" height="18" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="text-signal" aria-hidden>
      <path d="M16 10c-3-4-5.5-6-8.5-6a6 6 0 0 0 0 12c3 0 5.5-2 8.5-6Zm0 0c3 4 5.5 6 8.5 6a6 6 0 0 0 0-12c-3 0-5.5 2-8.5 6Z" />
    </svg>
  );
}
