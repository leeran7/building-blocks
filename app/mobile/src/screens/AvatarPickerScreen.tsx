import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { riseIn, sharedId, spring } from "../lib/motionTokens";
import {
  AVATARS,
  CHARACTER_ENTRIES,
  avatarEntry,
  characterIdOf,
  formatGems,
  lockedMessage,
  switchAwayWarning,
  unlockRequirementText,
  type AvatarEntry,
} from "@app/lib/avatars";
import type { AvatarUnlockState } from "@app/lib/avatarUnlocks";
import volcanoScene from "@app/../public/climb/volcano-tile.jpg";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { echoedSetting, useDashboard, useInvalidateAppData, useSettings } from "../contexts/AppDataContext";
import { HexAvatar } from "../components/HexAvatar";
import { GemIcon } from "../components/store/GemIcon";
import { CharacterPreview, type PreviewPose } from "../components/CharacterPreview";
import { PushHeader, RetryPanel } from "../components/ui";
import { identityNameFor, INITIALS_LABEL } from "../lib/identity";
import { notifyError, notifySuccess, tapLight } from "../lib/haptics";
import { useBackOr } from "../lib/navigation";
import { useNavigate } from "react-router-dom";
import { useRetry } from "../hooks/useRetry";
import { LAVA_CLEARANCE } from "../components/AnimatedBackdrop";

const COLUMNS = 3;
const TILE_HEX = 56;
const NEXT_HEX = 24;
/** The preview stage's figure height and canvas size: it fills a 112px-wide square. */
const PREVIEW_FIGURE_PX = 96;
const PREVIEW_CANVAS_PX = 124;
const LOAD_FAILED_MESSAGE = "Couldn't load your profile. Check your connection and try again.";
/**
 * How far above Save the grid fades out. At 18px the cut read as a hard line
 * across the tiles over the lava; this long, eased fade dissolves them.
 */
const SCROLL_FADE_PX = 48;
const SCROLL_FADE = `linear-gradient(to bottom, #000 calc(100% - ${SCROLL_FADE_PX}px), rgba(0,0,0,0.5) calc(100% - ${SCROLL_FADE_PX / 2}px), transparent)`;
/**
 * The clear save bar's height with no error line: pt-3, the 56px button, and
 * pb (1rem + the home indicator). Kept in step with the footer's classes.
 */
const SAVE_BAR_HEIGHT = "(0.75rem + 56px + 1rem + env(safe-area-inset-bottom))";
/**
 * Space after the last row so it can scroll clear of the lava. The scroller
 * ends at the save bar, but on tall screens the lava crest rises above the
 * bar, so the grid ends LAVA_CLEARANCE above the screen's bottom edge. Never
 * less than the fade, so the last row can scroll fully out of it. An error
 * line only makes the bar taller (a little extra space, never less).
 */
export const GRID_END_PADDING = `max(${SCROLL_FADE_PX}px, calc(${LAVA_CLEARANCE} - ${SAVE_BAR_HEIGHT}))`;
/** A 200 that did not store the pick: an API build older than avatars ignores the field. */
const AVATAR_NOT_SAVED = "Couldn't save your character. Please update the app or try again later.";
const SWITCH_WARNING_ID = "avatar-switch-warning";
/** How long Save reads "Saved" after a save before it goes back to normal. */
export const SAVED_FLASH_MS = 3000;
const POSES: ReadonlyArray<{ id: PreviewPose; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "walk", label: "Walk" },
  { id: "climb", label: "Climb" },
];

interface Option {
  id: string | null;
  name: string;
  entry: AvatarEntry | null;
}

const initials: Option = { id: null, name: INITIALS_LABEL, entry: null };
const optionOf = (a: AvatarEntry): Option => ({ id: a.id, name: a.name, entry: a });

/**
 * Picker order: the Shop character first, then the free-after-tutorial stick
 * figures, Initials, the star ladder cheapest first, and last the Gecko, the
 * final unlock for finishing a season. Skins are not
 * tiles: they are bought and equipped in the Shop, and a saved skin shows as
 * its character's tile, equipped.
 */
export const OPTIONS: readonly Option[] = [
  ...CHARACTER_ENTRIES.filter((a) => a.unlock.kind !== "stars" && a.unlock.kind !== "season").map(optionOf),
  initials,
  ...CHARACTER_ENTRIES.filter((a) => a.unlock.kind === "stars").map(optionOf),
  ...CHARACTER_ENTRIES.filter((a) => a.unlock.kind === "season").map(optionOf),
];

/** The tile a saved avatar shows as: a skin's character, else the id itself (null = Initials). */
export function tileIdOf(avatarId: string | null): string | null {
  return avatarId === null ? null : (characterIdOf(avatarId) ?? avatarId);
}

/** A tile the player cannot select yet, and what it takes. */
export interface TileLock {
  kind: AvatarEntry["unlock"]["kind"];
  /** "Earn 30 stars", "Finish the tutorial", "Buy in the Shop" */
  requirement: string;
  /** "Earn 30 stars to unlock Falcon. You have 12." */
  message: string;
  stars: number;
  /** Null unless the rule is a star count. */
  requiredStars: number | null;
}

/**
 * The lock on a picker option, or null when it is selectable. Initials and
 * every avatar are selectable when the server sent no unlock state (an API
 * build older than unlocks, which enforces none); the server's unlockedIds
 * already include the saved avatar.
 */
export function tileLock(entry: AvatarEntry | null, unlocks: AvatarUnlockState | undefined): TileLock | null {
  if (entry === null || unlocks === undefined || unlocks.unlockedIds.includes(entry.id)) return null;
  const need = entry.unlock.kind === "stars" ? entry.unlock.stars : null;
  return {
    kind: entry.unlock.kind,
    requirement: unlockRequirementText(entry),
    message: need === null ? `${lockedMessage(entry)}.` : `${lockedMessage(entry)}. You have ${unlocks.stars}.`,
    stars: unlocks.stars,
    requiredStars: need,
  };
}

/**
 * The warning to show before saving `selected` over a grandfathered saved
 * avatar (selectable only because it is saved), else null. Saving another
 * avatar locks it again until its rule is met.
 */
export function switchAwayNotice(
  current: string | null,
  selected: string | null,
  unlocks: AvatarUnlockState | undefined,
): string | null {
  if (current === null || selected === current || unlocks?.grandfatheredId !== current) return null;
  const entry = avatarEntry(current);
  return entry ? switchAwayWarning(entry) : null;
}

/** The star characters the player has unlocked, and how many there are. */
export function starUnlockCount(unlocks: AvatarUnlockState | undefined): { owned: number; total: number } {
  const ladder = AVATARS.filter((a) => a.unlock.kind === "stars");
  const owned = unlocks === undefined ? ladder.length : ladder.filter((a) => unlocks.unlockedIds.includes(a.id)).length;
  return { owned, total: ladder.length };
}

/**
 * The next star character to unlock and progress toward it from the step
 * before it (0..1), or null when every star character is selectable.
 */
export function nextStarUnlock(
  unlocks: AvatarUnlockState | undefined,
): { entry: AvatarEntry; starsLeft: number; progress: number } | null {
  if (unlocks === undefined) return null;
  let floor = 0;
  for (const a of AVATARS) {
    if (a.unlock.kind !== "stars") continue;
    if (unlocks.stars >= a.unlock.stars) {
      floor = a.unlock.stars;
      continue;
    }
    if (unlocks.unlockedIds.includes(a.id)) continue; // grandfathered
    const span = a.unlock.stars - floor;
    return {
      entry: a,
      starsLeft: a.unlock.stars - unlocks.stars,
      progress: span > 0 ? (unlocks.stars - floor) / span : 0,
    };
  }
  return null;
}

/**
 * How the picker lays the options out (the Choose Character design): the
 * player's own characters first (star characters they earned, a Shop
 * character they bought, the free ones, Initials), then the Shop characters
 * still for sale as rows of their own, then everything still locked.
 */
export interface PickerLayout {
  /** The grid: `owned` then `locked`, one radio group. */
  tiles: readonly Option[];
  /** Index in `tiles` where the locked ones start (a new row). */
  lockedStart: number;
  /** Shop characters not owned yet, shown as rows with a link to the Shop. */
  shop: readonly Option[];
}

export function pickerLayout(unlocks: AvatarUnlockState | undefined): PickerLayout {
  const open = (o: Option) => tileLock(o.entry, unlocks) === null;
  const kind = (o: Option) => o.entry?.unlock.kind ?? "initials";
  const owned = [
    ...OPTIONS.filter((o) => kind(o) === "stars" && open(o)),
    ...OPTIONS.filter((o) => kind(o) === "purchase" && open(o)),
    ...OPTIONS.filter((o) => kind(o) !== "stars" && kind(o) !== "purchase" && open(o)),
  ];
  const shop = OPTIONS.filter((o) => kind(o) === "purchase" && !open(o));
  const locked = OPTIONS.filter((o) => kind(o) !== "purchase" && !open(o));
  return { tiles: [...owned, ...locked], lockedStart: owned.length, shop };
}

type Cell = { row: number; col: number };

/** Each tile's visual (row, column): rows of COLUMNS, the locked tiles starting a new row. */
export function gridCells(count: number, lockedStart: number): Cell[] {
  const cells: Cell[] = [];
  let row = -1;
  let col = COLUMNS;
  for (let i = 0; i < count; i++) {
    if (i === lockedStart || col === COLUMNS) {
      row += 1;
      col = 0;
    }
    cells.push({ row, col });
    col += 1;
  }
  return cells;
}

/** The tile in visual row `row` nearest column `col`, or null past the grid's edge. */
function cellAt(cells: readonly Cell[], row: number, col: number): number | null {
  let best: number | null = null;
  cells.forEach((c, i) => {
    if (c.row !== row) return;
    if (best === null || Math.abs(c.col - col) < Math.abs(cells[best].col - col)) best = i;
  });
  return best;
}

/**
 * Index an arrow/Home/End key moves the radio selection to, or null for other
 * keys. Up and Down follow the visual grid, the locked rows included; Left and
 * Right step through the tiles in order.
 */
export function nextIndex(key: string, current: number, cells: readonly Cell[]): number | null {
  const count = cells.length;
  const here = cells[current];
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "ArrowDown":
      return cellAt(cells, here.row + 1, here.col) ?? current;
    case "ArrowUp":
      return cellAt(cells, here.row - 1, here.col) ?? current;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Character picker — pushed from Profile (tap the badge) and Edit Profile's
 * Character row. The avatar and the in-game character are one pick. Any tile
 * can be previewed; only an unlocked one can be saved. Saves one field
 * (`avatarId`); Save then reads "Saved" for SAVED_FLASH_MS.
 */
export function AvatarPickerScreen() {
  // Opened cold (deep link): there is no Profile / Edit Profile to pop back to.
  const goBack = useBackOr("/profile");
  const { user } = useAuth();
  const navigate = useNavigate();
  const settingsSlice = useSettings();
  const dash = useDashboard();
  const invalidate = useInvalidateAppData();

  const settingsData = settingsSlice.data;
  const { setSettings, refreshSettings } = settingsSlice;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingsRetry = useRetry(refreshSettings, {
    failed: settingsSlice.error,
    hasData: settingsData !== null,
    focusOnRecover: headingRef,
  });
  // The name the player would have with `avatarId` saved. With no display name
  // the pseudonym's animal follows the avatar, so "Initials" must preview
  // the initials of the hash-animal pseudonym, not of the current name. Every
  // badge is named with this, never with the current name.
  const nameWith = (avatarId: string | null) =>
    identityNameFor(settingsData && { ...settingsData, avatarId }, dash.data, user?.uid);
  // Tint key: the uid; with no signed-in user, the saved name.
  const userId = user?.uid ?? nameWith(settingsData?.avatarId ?? null);

  const [current, setCurrent] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [pose, setPose] = useState<PreviewPose>("walk");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlocks = settingsData?.avatarUnlocks;

  const layout = pickerLayout(unlocks);
  const cells = gridCells(layout.tiles.length, layout.lockedStart);
  const viewed = OPTIONS.find((o) => o.id === viewing) ?? layout.tiles[0] ?? OPTIONS[0];
  // The grid tile keyboard focus rests on: the viewed one, or the first when
  // a Shop row is being viewed.
  const viewingIndex = Math.max(0, layout.tiles.indexOf(viewed));
  const viewedLock = tileLock(viewed.entry, unlocks);
  // A saved skin is equipped on its character's tile.
  const currentTile = tileIdOf(current);
  const changed = viewing !== currentTile;
  const shopLink = viewedLock?.kind === "purchase" && viewing !== null;
  const canSave = changed && viewedLock === null && !saving;
  const switchWarning = viewedLock ? null : switchAwayNotice(current, viewing, unlocks);
  const counts = starUnlockCount(unlocks);
  const next = nextStarUnlock(unlocks);

  // Stars rise with every level cleared, so ask for the unlock state once
  // on open. A warm slice keeps its data while this runs (no skeleton), and
  // the seeding below ignores it, so a pick in progress is never overridden.
  const refreshedOnOpen = useRef(false);
  useEffect(() => {
    if (refreshedOnOpen.current) return;
    refreshedOnOpen.current = true;
    void refreshSettings();
  }, [refreshSettings]);

  // Seed once so a background settings refresh never overrides a pick in progress.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsData) return;
    seeded.current = true;
    setCurrent(settingsData.avatarId);
    setViewing(tileIdOf(settingsData.avatarId));
  }, [settingsData]);

  // "Saved" goes back to "Save character" after a few seconds.
  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [savedFlash]);

  const tiles = useRef<Array<HTMLButtonElement | null>>([]);
  const saveRef = useRef<HTMLButtonElement>(null);
  // Save is disabled while in flight, which drops its focus. When the save
  // fails, hand focus back to it so a keyboard or switch user can retry; the
  // role=alert above it announces why.
  useEffect(() => {
    if (error && !saving) saveRef.current?.focus();
  }, [error, saving]);

  const view = (o: Option) => {
    if (o.id !== viewing) void tapLight();
    setViewing(o.id);
    setError(null);
    setSavedFlash(false);
  };

  const onTileKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = nextIndex(e.key, i, cells);
    if (n === null) return;
    e.preventDefault();
    view(layout.tiles[n]);
    tiles.current[n]?.focus();
  };

  const save = async () => {
    if (shopLink) {
      void tapLight();
      navigate(`/shop/${viewing}`);
      return;
    }
    if (!settingsData || !canSave) return;
    const picked = viewing;
    void tapLight();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: picked }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Could not save your character. Try again.");
        void notifyError();
        // AVATAR_LOCKED: this copy's unlock state was stale; fetch the server's.
        if (res.status === 403) void refreshSettings();
        return;
      }
      const nextSettings = echoedSetting(await res.json().catch(() => null), "avatarId", picked);
      if (!nextSettings) {
        // The cached avatar stays the saved one.
        setError(AVATAR_NOT_SAVED);
        void notifyError();
        return;
      }
      setSettings(nextSettings);
      setCurrent(picked);
      setSavedFlash(true);
      // Save is disabled now (nothing changed): keep keyboard focus on the grid.
      tiles.current[layout.tiles.findIndex((o) => o.id === picked)]?.focus();
      // An avatar can rename a player with no display name (the pseudonym's
      // animal follows it), so every cached copy of their name goes stale:
      // both boards and the dashboard handle behind the Profile header.
      invalidate(["leaderboard", "friendsLeaderboard", "dashboard"]);
      void notifySuccess();
    } catch {
      setError("Could not save your character. Check your connection.");
      void notifyError();
    } finally {
      setSaving(false);
    }
  };

  // Stays true through a retry so Try again (and its focus) stays put.
  const loadFailed = settingsRetry.showError;

  const tag =
    viewing === currentTile
      ? current !== currentTile
        ? `Equipped · ${avatarEntry(current)?.name ?? ""}`
        : "Equipped"
      : viewedLock === null
        ? "Unlocked"
        : viewedLock.kind === "stars"
          ? `${viewedLock.requiredStars} ★ to unlock`
          : viewedLock.kind === "purchase" && viewed.entry?.unlock.kind === "purchase"
            ? `${formatGems(viewed.entry.unlock.gems)} gems`
            : viewedLock.requirement;
  const blurb =
    viewed.entry === null
      ? "Initials on your badge. You climb as the Green Stick."
      : viewedLock === null
        ? "Your climber and your leaderboard badge."
        : viewedLock.message;
  const saveLabel = saving
    ? "Saving…"
    : savedFlash && !changed
      ? "Saved"
      : !changed
        ? "Equipped"
      : viewedLock?.kind === "premium"
        ? "Not on sale yet"
        : shopLink
          ? "Get it in the Shop"
        : viewedLock?.kind === "tutorial"
          ? "Clear level 1 first"
        : viewedLock?.kind === "season"
          ? "Finish the season first"
          : viewedLock !== null
            ? `Locked: earn ${Math.max(0, (viewedLock.requiredStars ?? 0) - viewedLock.stars)} more ★`
            : "Save character";

  return (
    <main data-avatar-page className="flex h-full min-h-0 flex-col">
      <PushHeader title="Choose character" onBack={goBack} headingRef={headingRef} />

      {settingsData && !loadFailed && (
        // The details rise in around the avatar flying in from Profile or Edit profile.
        <motion.div data-avatar-pinned initial="hidden" animate="shown" className="flex shrink-0 flex-col gap-2.5 px-4 pb-2">
          {/* The stage sits beside the details, not above them: a small square
              the figure fills, so it never floats under the pose switch. */}
          <motion.section
            variants={riseIn}
            custom={0}
            aria-label="Selected character"
            className="glass flex gap-3 overflow-hidden rounded-3xl border border-white/10 p-2.5"
          >
            <div
              className="relative flex min-h-[132px] w-[112px] shrink-0 items-end justify-center overflow-hidden rounded-2xl border border-white/10 bg-cover bg-bottom"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(10,10,12,0.45), rgba(10,10,12,0.05) 50%, rgba(10,10,12,0.35)), url(${volcanoScene})` }}
            >
              {/* Your avatar on Profile or Edit profile flies into this spot (sharedId). */}
              <motion.div layoutId={sharedId.myAvatar} layoutCrossfade={false} transition={spring.smooth} className="flex">
                <CharacterPreview
                  avatarId={viewing}
                  pose={pose}
                  locked={viewedLock !== null}
                  figurePx={PREVIEW_FIGURE_PX}
                  sizePx={PREVIEW_CANVAS_PX}
                />
              </motion.div>
              {viewedLock && (
                <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full border border-white/15 bg-void/80 px-1.5 py-1 font-mono text-[10px] font-bold uppercase leading-none tracking-label text-text-primary">
                  <LockIcon />
                  {viewedLock.kind === "premium" ? "Coming soon" : viewedLock.kind === "purchase" ? "In Shop" : "Locked"}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1 pr-1">
              <p
                aria-live="polite"
                className="truncate font-display text-xl font-black uppercase leading-none tracking-tight text-text-primary"
              >
                {viewed.name}
              </p>
              <span
                className={`truncate font-mono text-label font-bold uppercase tracking-label ${
                  viewedLock ? "text-text-secondary" : "text-signal"
                }`}
              >
                {tag}
              </span>
              <p data-avatar-lock-notice className="text-meta leading-5 text-text-secondary">
                {blurb}
              </p>
              {viewedLock && viewedLock.requiredStars !== null && (
                <ProgressBar value={viewedLock.stars} max={viewedLock.requiredStars} />
              )}
              <div role="group" aria-label="Preview pose" className="mt-auto flex rounded-full bg-void/70 p-[3px]">
                {POSES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={pose === p.id}
                    onClick={() => setPose(p.id)}
                    className={`flex-1 rounded-full py-1.5 font-mono text-label font-bold uppercase tracking-label ${
                      pose === p.id ? "bg-signal text-void" : "text-text-secondary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.section>

          {/* One slim line, not a card, so the grid below gets the height. */}
          {next && (
            <motion.div variants={riseIn} custom={1} data-avatar-next className="flex items-center gap-2 px-0.5">
              <HexAvatar userId={userId} name={next.entry.name} avatarId={next.entry.id} size={NEXT_HEX} />
              <p className="shrink-0 text-meta text-text-secondary">
                Next: <span className="font-semibold text-text-primary">{next.entry.name}</span> · {next.starsLeft}{" "}
                {next.starsLeft === 1 ? "star" : "stars"} to unlock
              </p>
              <div aria-hidden className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-signal" style={{ width: `${Math.round(next.progress * 100)}%` }} />
              </div>
            </motion.div>
          )}

          <motion.p variants={riseIn} custom={2} className="-mx-4 mt-1 flex items-center justify-between bg-void/60 px-4 py-2.5 font-mono text-label font-bold uppercase tracking-eyebrow">
            <span className="text-text-primary">Your characters</span>
            <span className="text-signal">
              {counts.owned} / {counts.total} unlocked
            </span>
          </motion.p>
        </motion.div>
      )}

      {/* Takes every pixel between the pinned preview and the save bar; the
          grid scrolls inside it. */}
      <motion.div
        variants={riseIn}
        custom={3}
        initial="hidden"
        animate="shown"
        data-avatar-scroller
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          maskImage: SCROLL_FADE,
          WebkitMaskImage: SCROLL_FADE,
        }}
      >
        {loadFailed ? (
          <RetryPanel
            message={LOAD_FAILED_MESSAGE}
            retrying={settingsRetry.retrying}
            attempts={settingsRetry.attempts}
            onRetry={() => void settingsRetry.retry()}
          />
        ) : !settingsData ? (
          <div role="status" aria-busy="true" aria-label="Loading characters" className="flex flex-col gap-3">
            <div className="h-52 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
            <div className="h-80 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
          </div>
        ) : (
          <div
            data-avatar-content
            className="flex flex-col gap-4 pb-(--avatar-grid-end)"
            style={{ "--avatar-grid-end": GRID_END_PADDING } as CSSProperties}
          >
            <div role="radiogroup" aria-label="Characters" className="flex flex-col gap-2.5">
              {[0, 1].map((part) => {
                const from = part === 0 ? 0 : layout.lockedStart;
                const to = part === 0 ? layout.lockedStart : layout.tiles.length;
                if (from === to) return null;
                return (
                  <div key={part} className="flex flex-col gap-2.5">
                    {part === 1 && (
                      <p aria-hidden className="px-0.5 pt-1 font-mono text-label font-bold uppercase tracking-label text-text-muted">
                        Still locked
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2.5">
                      {layout.tiles.slice(from, to).map((o, k) => {
                        const i = from + k;
                        const checked = o.id === currentTile;
                        const isViewed = i === viewingIndex && viewed === o;
                        const lock = tileLock(o.entry, unlocks);
                        const label = o.id === null ? "Use initials" : o.name;
                        return (
                  <button
                    key={o.id ?? "initials"}
                    ref={(el) => {
                      tiles.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isViewed}
                    aria-label={
                      lock
                        ? `${label}, locked. ${lock.requirement}${lock.requiredStars !== null ? `, you have ${lock.stars}` : ""}`
                        : checked
                          ? `${label}, equipped`
                          : label
                    }
                    data-locked={lock ? "" : undefined}
                    data-equipped={checked ? "" : undefined}
                    tabIndex={i === viewingIndex ? 0 : -1}
                    onClick={() => view(o)}
                    onKeyDown={(e) => onTileKey(e, i)}
                    className={`relative flex min-h-[88px] min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1 pb-2 pt-2.5 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
                      checked
                        ? "border-signal bg-signal/[0.1] shadow-[0_0_0_1px_var(--color-signal),0_0_18px_-4px_rgba(203,242,77,0.55)]"
                        : isViewed
                          ? "border-text-secondary bg-[rgba(16,15,20,0.9)] shadow-[0_0_0_1px_var(--color-text-secondary)]"
                          : "border-white/10 bg-[rgba(16,15,20,0.9)]"
                    }`}
                  >
                    <span className={lock ? "opacity-40 grayscale" : undefined}>
                      <HexAvatar userId={userId} name={nameWith(o.id)} avatarId={o.id} size={TILE_HEX} />
                    </span>
                    <span
                      className={`line-clamp-2 break-words text-center text-meta font-semibold leading-tight ${
                        checked ? "text-signal" : lock ? "text-text-secondary" : "text-text-primary"
                      }`}
                    >
                      {o.id === null ? INITIALS_LABEL : o.name}
                    </span>
                    {lock && (
                      <span
                        aria-hidden
                        className={`font-mono text-label font-bold uppercase leading-tight ${
                          lock.kind === "premium" || lock.kind === "purchase" ? "text-warning" : "text-text-secondary"
                        }`}
                      >
                        {lock.kind === "stars"
                          ? `${lock.stars}/${lock.requiredStars} ★`
                          : lock.kind === "tutorial"
                            ? "Tutorial"
                            : lock.kind === "season"
                              ? "Season"
                            : lock.kind === "purchase"
                              ? "Shop"
                              : "Premium"}
                      </span>
                    )}
                    {checked ? (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-signal text-void"
                      >
                        <CheckIcon />
                      </span>
                    ) : (
                      lock && (
                        <span
                          aria-hidden
                          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-text-secondary"
                        >
                          <LockIcon />
                        </span>
                      )
                    )}
                  </button>
                        );
                      })}
                    </div>
                    {part === 0 &&
                      layout.shop.map((o) => (
                        <ShopRow
                          key={o.id}
                          option={o}
                          viewed={viewed === o}
                          userId={userId}
                          onView={() => view(o)}
                          onShop={() => {
                            void tapLight();
                            navigate(`/shop/${o.id}`);
                          }}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* Sticky save bar: the last row of the full-height page, outside the
          scroller so Save is reachable from any row, just above the home
          indicator. It is clear (no surface, border or shadow), so the
          backdrop shows behind Save down to the bottom edge. Tiles never pass
          under the button: they stop at the scroller's edge, where
          SCROLL_FADE fades them out into the backdrop, and GRID_END_PADDING
          lets the last row scroll above the lava crest. */}
      {settingsData && (
        <footer
          data-avatar-save-bar
          className="flex shrink-0 flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        >
          {error && (
            <p role="alert" className="glass rounded-2xl border border-ember/40 px-4 py-2.5 text-meta leading-5 text-ember">
              {error}
            </p>
          )}
          {switchWarning && (
            <p
              id={SWITCH_WARNING_ID}
              data-avatar-switch-warning
              className="glass rounded-2xl border border-ember/40 px-4 py-2.5 text-meta leading-5 text-text-primary"
            >
              {switchWarning}
            </p>
          )}
          <button
            ref={saveRef}
            data-avatar-save
            aria-describedby={switchWarning ? SWITCH_WARNING_ID : undefined}
            onClick={() => void save()}
            disabled={!canSave && !shopLink}
            className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl font-display text-lead font-black uppercase tracking-wide transition-transform active:scale-[0.98] disabled:active:scale-100 ${
              canSave || shopLink || (savedFlash && !changed) ? "cta-lime text-void" : "bg-elevated text-text-muted shadow-[inset_0_0_0_1px_var(--color-border-subtle)]"
            }`}
          >
            {savedFlash && !changed && !saving && <CheckIcon />}
            {saveLabel}
          </button>
          <p role="status" className="sr-only">
            {savedFlash && !changed ? "Saved" : ""}
          </p>
        </footer>
      )}
    </main>
  );
}

/**
 * A Shop character still for sale: its badge, name and price, and a link to
 * its page in the Shop. Tapping the row previews it above.
 */
function ShopRow({
  option,
  viewed,
  userId,
  onView,
  onShop,
}: {
  option: Option;
  viewed: boolean;
  userId: string;
  onView: () => void;
  onShop: () => void;
}) {
  const price = option.entry?.unlock.kind === "purchase" ? option.entry.unlock.gems : null;
  return (
    <div
      data-avatar-shop-row={option.id}
      className={`flex items-center gap-3 rounded-2xl border bg-[rgba(16,15,20,0.9)] p-3 ${
        viewed ? "border-text-secondary shadow-[0_0_0_1px_var(--color-text-secondary)]" : "border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={onView}
        aria-label={`Preview ${option.name}${price !== null ? `, ${formatGems(price)} gems in the Shop` : ""}`}
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 text-left"
      >
        <HexAvatar userId={userId} name={option.name} avatarId={option.id} size={TILE_HEX} />
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-text-primary">{option.name}</span>
          {price !== null && (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-meta text-text-secondary">
              <GemIcon size={16} /> {formatGems(price)} gems
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onShop}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-void/60 px-4 font-mono text-label font-bold uppercase tracking-label text-signal transition-transform active:scale-95"
      >
        View in shop
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full bg-signal" style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }} />
      </div>
      <div className="flex justify-between font-mono text-label text-text-secondary tabular-nums">
        <span>{value} ★</span>
        <span>{max} ★</span>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
