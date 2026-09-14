"use client";

/**
 * GameExitButton — the in-game escape hatch for the full-bleed mobile stage.
 *
 * On touch devices the climb / duel screens render `fixed inset-0`, covering the
 * navbar, so this is the only way back out. Mirrors the native app's in-game
 * back button (app/mobile/src/screens/ClimbScreen.tsx): a small circular
 * arrow-left in the top-left safe-area band.
 *
 * Defaults to navigating home ("/"). Pass `onLeave` for surfaces that need to
 * run teardown first (e.g. a duel forfeiting Ably presence before leaving).
 */

import { useRouter } from "next/navigation";
import type { SafeAreaInsets } from "../../hooks/useSafeAreaInsets";

/** Height (px) of the top HUD band the button sits in. Matches ClimbScene. */
export const GAME_EXIT_BAR_PX = 40;

export function GameExitButton({
  safeArea,
  onLeave,
  label = "Back to home",
}: {
  safeArea: SafeAreaInsets;
  /** Runs instead of the default navigate-home when provided. */
  onLeave?: () => void;
  label?: string;
}) {
  const router = useRouter();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30"
      style={{
        paddingTop: safeArea.top,
        paddingLeft: `max(8px, ${safeArea.left}px)`,
        paddingRight: `max(8px, ${safeArea.right}px)`,
      }}
    >
      <div
        className="flex items-center pointer-events-auto"
        style={{ height: GAME_EXIT_BAR_PX }}
      >
        <button
          type="button"
          data-game-control
          aria-label={label}
          onClick={() => {
            if (onLeave) onLeave();
            else router.push("/");
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-void/50 text-text-muted transition-transform active:scale-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
