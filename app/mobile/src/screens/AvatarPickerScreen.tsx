import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
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
const NEXT_HEX = 34;
const LOAD_FAILED_MESSAGE = "Couldn't load your profile. Check your connection and try again.";
const SCROLL_FADE = "linear-gradient(to bottom, #000 calc(100% - 18px), transparent)";
/**
 * The clear save bar's height with no error line: pt-3, the 56px button, and
 * pb (1rem + the home indicator). Kept in step with the footer's classes.
 */
const SAVE_BAR_HEIGHT = "(0.75rem + 56px + 1rem + env(safe-area-inset-bottom))";
/**
 * Space after the last row so it can scroll clear of the lava. The scroller
 * ends at the save bar, but on tall screens the lava crest rises above the
 * bar, so the grid ends LAVA_CLEARANCE above the screen's bottom edge. Never
 * less than 1rem. An error line only makes the bar taller (a little extra
 * space, never less).
 */
export const GRID_END_PADDING = `max(1rem, calc(${LAVA_CLEARANCE} - ${SAVE_BAR_HEIGHT}))`;
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
 * Picker order: the Shop character first, then the free-after-tutorial ones
 * (Gecko and the stick figures), Initials, and the star ladder cheapest
 * first. CHARACTER_ENTRIES already lists them in that order. Skins are not
 * tiles: they are bought and equipped in the Shop, and a saved skin shows as
 * its character's tile, equipped.
 */
export const OPTIONS: readonly Option[] = [
  ...CHARACTER_ENTRIES.filter((a) => a.unlock.kind !== "stars").map(optionOf),
  initials,
  ...CHARACTER_ENTRIES.filter((a) => a.unlock.kind === "stars").map(optionOf),
];

/** The tile a saved avatar shows as: a skin's character, else the id itself (null = Initials). */
export function tileIdOf(avatarId: string | null): string | null {
  return avatarId === null ? null : (characterIdOf(avatarId) ?? avatarId);
}

/** The group heading shown above option `i`, or null inside a group. */
export function groupHeading(i: number): string | null {
  const kind = (o: Option | undefined) => (o === undefined ? null : (o.entry?.unlock.kind ?? "initials"));
  const here = kind(OPTIONS[i]);
  const before = kind(OPTIONS[i - 1]);
  if (here === before) return null;
  if (here === "premium") return "Premium · coming soon";
  if (here === "purchase") return "Shop · buy with gems";
  if (here === "tutorial") return "Free after the tutorial";
  if (here === "initials" || (here === "stars" && before !== "initials")) return "Initials and star unlocks";
  return null;
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
 * Each option's visual (row, column) in the grid. A group heading spans a
 * full row, so each group starts a new row and a short last row leaves gaps.
 */
export const GRID_CELLS: ReadonlyArray<{ row: number; col: number }> = (() => {
  const cells: { row: number; col: number }[] = [];
  let row = -1;
  let col = COLUMNS;
  OPTIONS.forEach((_, i) => {
    if (groupHeading(i) !== null || col === COLUMNS) {
      row += 1;
      col = 0;
    }
    cells.push({ row, col });
    col += 1;
  });
  return cells;
})();

/** The option in visual row `row` nearest column `col`, or null past the grid's edge. */
function cellAt(row: number, col: number): number | null {
  let best: number | null = null;
  GRID_CELLS.forEach((c, i) => {
    if (c.row !== row) return;
    if (best === null || Math.abs(c.col - col) < Math.abs(GRID_CELLS[best].col - col)) best = i;
  });
  return best;
}

/**
 * Index an arrow/Home/End key moves the radio selection to, or null for other
 * keys. Up and Down follow the visual grid, group rows included; Left and
 * Right step through the options in order.
 */
export function nextIndex(key: string, current: number, count: number): number | null {
  const here = GRID_CELLS[current];
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "ArrowDown":
      return cellAt(here.row + 1, here.col) ?? current;
    case "ArrowUp":
      return cellAt(here.row - 1, here.col) ?? current;
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

  const viewingIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.id === viewing),
  );
  const viewed = OPTIONS[viewingIndex];
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

  const choose = (i: number) => {
    if (OPTIONS[i].id !== viewing) void tapLight();
    setViewing(OPTIONS[i].id);
    setError(null);
    setSavedFlash(false);
  };

  const onTileKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = nextIndex(e.key, i, OPTIONS.length);
    if (n === null) return;
    e.preventDefault();
    choose(n);
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
      tiles.current[OPTIONS.findIndex((o) => o.id === picked)]?.focus();
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
      ? "Your badge shows your initials. You climb as the Green Stick."
      : viewedLock === null
        ? "Your climber in every run, and your badge on the leaderboards."
        : viewedLock.message;
  const saveLabel = saving
    ? "Saving…"
    : savedFlash && !changed
      ? "Saved"
      : viewedLock?.kind === "premium"
        ? "Not on sale yet"
        : shopLink
          ? "Get it in the Shop"
        : viewedLock?.kind === "tutorial"
          ? "Clear level 1 first"
          : viewedLock !== null
            ? `Locked: earn ${Math.max(0, (viewedLock.requiredStars ?? 0) - viewedLock.stars)} more ★`
            : "Save character";

  return (
    <main data-avatar-page className="flex h-full min-h-0 flex-col">
      <PushHeader title="Choose character" onBack={goBack} headingRef={headingRef} />

      {settingsData && !loadFailed && (
        <div data-avatar-pinned className="flex shrink-0 flex-col gap-2.5 px-4 pb-2">
          <section
            aria-label="Selected character"
            className="glass overflow-hidden rounded-3xl border border-white/10"
          >
            <div
              className="relative flex h-[150px] items-end justify-center bg-cover bg-bottom"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(10,10,12,0.55), rgba(10,10,12,0.1) 45%, rgba(10,10,12,0.4)), url(${volcanoScene})` }}
            >
              <div role="group" aria-label="Preview pose" className="absolute left-2.5 top-2.5 flex gap-1 rounded-full bg-void/70 p-[3px]">
                {POSES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={pose === p.id}
                    onClick={() => setPose(p.id)}
                    className={`rounded-full px-2.5 py-1.5 font-mono text-label font-bold uppercase tracking-label ${
                      pose === p.id ? "bg-signal text-void" : "text-text-secondary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {viewedLock && (
                <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/15 bg-void/80 px-2 py-1.5 font-mono text-label font-bold uppercase tracking-label text-text-primary">
                  <LockIcon />
                  {viewedLock.kind === "premium" ? "Coming soon" : viewedLock.kind === "purchase" ? "In Shop" : "Locked"}
                </span>
              )}
              <CharacterPreview avatarId={viewing} pose={pose} locked={viewedLock !== null} />
            </div>
            <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  aria-live="polite"
                  className="font-display text-xl font-black uppercase leading-none tracking-tight text-text-primary"
                >
                  {viewed.name}
                </p>
                <span
                  className={`whitespace-nowrap font-mono text-label font-bold uppercase tracking-label ${
                    viewedLock ? "text-text-secondary" : "text-signal"
                  }`}
                >
                  {tag}
                </span>
              </div>
              <p data-avatar-lock-notice className="text-meta leading-5 text-text-secondary">
                {blurb}
              </p>
              {viewedLock && viewedLock.requiredStars !== null && (
                <ProgressBar value={viewedLock.stars} max={viewedLock.requiredStars} />
              )}
            </div>
          </section>

          {next && (
            <div data-avatar-next className="glass flex items-center gap-2.5 rounded-2xl border border-white/10 px-3 py-2.5">
              <HexAvatar userId={userId} name={next.entry.name} avatarId={next.entry.id} size={NEXT_HEX} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-meta text-text-secondary">
                  Next: <span className="font-semibold text-text-primary">{next.entry.name}</span> in {next.starsLeft} ★
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div className="h-full rounded-full bg-signal" style={{ width: `${Math.round(next.progress * 100)}%` }} />
                </div>
              </div>
            </div>
          )}

          <p className="flex justify-between px-0.5 pt-1 font-mono text-label font-bold uppercase tracking-label text-text-secondary">
            <span>Characters</span>
            <span className="text-signal">
              {counts.owned}/{counts.total} unlocked
            </span>
          </p>
        </div>
      )}

      {/* Takes every pixel between the pinned preview and the save bar; the
          grid scrolls inside it. */}
      <div
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
            <div role="radiogroup" aria-label="Characters" className="grid grid-cols-3 gap-2.5">
              {OPTIONS.map((o, i) => {
                const checked = o.id === currentTile;
                const isViewed = i === viewingIndex;
                const lock = tileLock(o.entry, unlocks);
                const heading = groupHeading(i);
                const label = o.id === null ? "Use initials" : o.name;
                return [
                  heading && (
                    <p
                      key={`h-${i}`}
                      aria-hidden
                      className="col-span-3 px-0.5 pt-1 font-mono text-label font-bold uppercase tracking-label text-text-muted"
                    >
                      {heading}
                    </p>
                  ),
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
                    tabIndex={isViewed ? 0 : -1}
                    onClick={() => choose(i)}
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
                  </button>,
                ];
              })}
            </div>
          </div>
        )}
      </div>

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
