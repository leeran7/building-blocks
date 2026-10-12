/**
 * YouTube Playables SDK adapter.
 *
 * The SDK script (`https://www.youtube.com/game_api/v1`) is loaded from
 * head.html before any game code, so `window.ytgame` is either there when this
 * runs or never will be (opened outside YouTube, or blocked). Every call is
 * guarded; with no SDK the game falls back to localStorage and the page's own
 * visibility for pause.
 *
 * Playables saves are one string per player. This adapter keeps one JSON
 * object in it (`{ [key]: value }`) so the key/value PlatformAdapter contract
 * still holds.
 *
 * Docs: https://developers.google.com/youtube/gaming/playables/reference/sdk
 */

import type { PlatformAdapter } from "../types";
import { localLoad, localSave } from "../noop";
import { safely, settleWithin } from "../../portal/sdkGuard";

export const YOUTUBE_SDK_URL = "https://www.youtube.com/game_api/v1";
/** How long a cloud load or save may take before the local copy is used. */
export const SAVE_TIMEOUT_MS = 5_000;

/** The slice of `window.ytgame` this game uses. Every member is optional: trust nothing. */
export interface YtGame {
  game?: {
    firstFrameReady?: () => void;
    gameReady?: () => void;
    loadData?: () => unknown;
    saveData?: (data: string) => unknown;
  };
  system?: {
    isAudioEnabled?: () => unknown;
    onAudioEnabledChange?: (cb: (enabled: boolean) => void) => unknown;
    onPause?: (cb: () => void) => unknown;
    onResume?: (cb: () => void) => unknown;
  };
}

export interface YouTubeDeps {
  /** `window.ytgame`, or undefined when the SDK did not load. */
  getYt: () => YtGame | undefined;
  /** Pause source when there is no SDK: the page's own visibility. */
  fallbackPauseChange: PlatformAdapter["onPauseChange"];
}

/** Allow-list parse of the Playables save string: only string values survive. */
export function parseSaveBlob(raw: unknown): Map<string, string> | null {
  if (raw === "" || raw === null || raw === undefined) return new Map();
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") out.set(k, v);
  }
  return out;
}

export function createYouTubePlatform(deps: YouTubeDeps): PlatformAdapter {
  let framed = false;
  let ready = false;
  /** The cloud save as last read or written; null until a read succeeded. */
  let blob: Map<string, string> | null = null;

  const yt = () => safely(deps.getYt, undefined);

  /** The cloud save, read once. Null when there is no SDK or the read failed. */
  async function cloud(): Promise<Map<string, string> | null> {
    if (blob) return blob;
    const load = yt()?.game?.loadData;
    if (typeof load !== "function") return null;
    const result = await settleWithin(() => load.call(yt()?.game) as unknown, SAVE_TIMEOUT_MS);
    if (!result.ok) return null;
    blob = parseSaveBlob(result.value);
    return blob;
  }

  /** Subscribe through an SDK hook that returns its unsubscribe (or nothing). */
  function subscribe(hook: (() => unknown) | undefined): () => void {
    if (!hook) return () => {};
    const off = safely(hook, undefined);
    return () => {
      if (typeof off === "function") safely(() => (off as () => void)(), undefined);
    };
  }

  return {
    init: async () => {},
    loadingStart: () => {},
    /** The menu has painted and takes input: first frame, then ready. Once each. */
    loadingStop: () => {
      const game = yt()?.game;
      if (!game) return;
      if (!framed) {
        framed = safely(() => {
          game.firstFrameReady?.();
          return true;
        }, false);
      }
      if (!ready) {
        ready = safely(() => {
          game.gameReady?.();
          return true;
        }, false);
      }
    },
    // Playables has no gameplay or celebration events.
    gameplayStart: () => {},
    gameplayStop: () => {},
    happyMoment: () => {},
    async loadData(key) {
      const saved = await cloud();
      const value = saved?.get(key);
      return value ?? localLoad(key);
    },
    async saveData(key, value) {
      localSave(key, value);
      const save = yt()?.game?.saveData;
      if (typeof save !== "function") return;
      // Never write a blob that failed to read: it would drop the other keys.
      const saved = await cloud();
      if (!saved) return;
      const next = new Map(saved);
      next.set(key, value);
      const result = await settleWithin(
        () => save.call(yt()?.game, JSON.stringify(Object.fromEntries(next))) as unknown,
        SAVE_TIMEOUT_MS,
      );
      if (result.ok) blob = next;
    },
    isAudioAllowed() {
      const isOn = yt()?.system?.isAudioEnabled;
      if (typeof isOn !== "function") return true;
      return safely(() => isOn.call(yt()?.system) !== false, true);
    },
    onAudioAllowedChange(cb) {
      const system = yt()?.system;
      const hook = system?.onAudioEnabledChange;
      if (typeof hook !== "function") return () => {};
      return subscribe(() => hook.call(system, (enabled) => cb(enabled !== false)));
    },
    onPauseChange(cb) {
      const system = yt()?.system;
      const onPause = system?.onPause;
      const onResume = system?.onResume;
      if (typeof onPause !== "function" || typeof onResume !== "function") {
        return safely(() => deps.fallbackPauseChange(cb), () => {});
      }
      const offPause = subscribe(() => onPause.call(system, () => cb(true)));
      const offResume = subscribe(() => onResume.call(system, () => cb(false)));
      return () => {
        offPause();
        offResume();
      };
    },
  };
}
