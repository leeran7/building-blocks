import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AVATARS } from "@app/lib/avatars";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  settingsFromResponse,
  useDashboard,
  useInvalidateAppData,
  useSettings,
} from "../contexts/AppDataContext";
import { HexAvatar } from "../components/HexAvatar";
import { PushHeader, StateMessage } from "../components/ui";
import { identityNameFor } from "../lib/identity";
import { notifyError, notifySuccess, tapLight } from "../lib/haptics";

const INITIALS_LABEL = "Initials";
const COLUMNS = 3;
const TILE_HEX = 64;
const PREVIEW_HEX = 128;
const SCROLL_FADE = "linear-gradient(to bottom, #000 calc(100% - 18px), transparent)";

const OPTIONS: ReadonlyArray<{ id: string | null; name: string }> = [
  { id: null, name: INITIALS_LABEL },
  ...AVATARS.map((a) => ({ id: a.id, name: a.name })),
];

/** Index an arrow/Home/End key moves the radio selection to, or null for other keys. */
function nextIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "ArrowDown":
      return Math.min(current + COLUMNS, count - 1);
    case "ArrowUp":
      return Math.max(current - COLUMNS, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Avatar picker — pushed from Profile (tap the avatar) and Edit Profile's
 * Avatar row. Saves one field (`avatarId`) and pops back on success.
 */
export function AvatarPickerScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const settingsSlice = useSettings();
  const dash = useDashboard();
  const invalidate = useInvalidateAppData();

  const settingsData = settingsSlice.data;
  const { setSettings, refreshSettings } = settingsSlice;
  const name = identityNameFor(settingsData, dash.data);
  const userId = user?.uid ?? name;

  const [current, setCurrent] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed once so a background settings refresh never overrides a pick in progress.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsData) return;
    seeded.current = true;
    setCurrent(settingsData.avatarId);
    setSelected(settingsData.avatarId);
  }, [settingsData]);

  const tiles = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.id === selected),
  );
  const selectedName = OPTIONS[selectedIndex].name;
  const changed = selected !== current;

  const choose = (i: number) => {
    if (OPTIONS[i].id !== selected) void tapLight();
    setSelected(OPTIONS[i].id);
    setError(null);
  };

  const onTileKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextIndex(e.key, i, OPTIONS.length);
    if (next === null) return;
    e.preventDefault();
    choose(next);
    tiles.current[next]?.focus();
  };

  const save = async () => {
    if (!settingsData || !changed || saving) return;
    void tapLight();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: selected }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Could not save your avatar. Try again.");
        void notifyError();
        return;
      }
      const next = settingsFromResponse(await res.json().catch(() => null));
      setSettings(next ?? { ...settingsData, avatarId: selected });
      invalidate(["leaderboard", "friendsLeaderboard"]);
      void notifySuccess();
      navigate(-1);
    } catch {
      setError("Could not save your avatar. Check your connection.");
      void notifyError();
    } finally {
      setSaving(false);
    }
  };

  const loadFailed = settingsSlice.error && !settingsData;

  return (
    <main className="flex h-full flex-col">
      <PushHeader title="Choose avatar" onBack={() => navigate(-1)} />

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          maskImage: SCROLL_FADE,
          WebkitMaskImage: SCROLL_FADE,
        }}
      >
        {loadFailed ? (
          <div className="flex flex-col items-center gap-4">
            <StateMessage>Couldn&apos;t load your profile. Check your connection and try again.</StateMessage>
            <button
              type="button"
              onClick={() => void refreshSettings()}
              className="glass min-h-[48px] rounded-2xl border border-white/10 px-6 text-[15px] font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              Try again
            </button>
          </div>
        ) : !settingsData ? (
          <div role="status" aria-busy="true" aria-label="Loading avatars" className="flex flex-col gap-3">
            <div className="h-52 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
            <div className="h-80 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            <section
              aria-label="Selected avatar"
              className="glass flex flex-col items-center rounded-3xl border border-white/10 px-5 pb-5 pt-6"
            >
              <HexAvatar userId={userId} name={name} avatarId={selected} size={PREVIEW_HEX} />
              <p
                aria-live="polite"
                className="mt-3 font-display text-xl font-black uppercase leading-none tracking-tight text-text-primary"
              >
                {selectedName}
              </p>
              <p className="mt-1.5 text-center text-[13px] text-text-secondary">
                Shown on your profile and the leaderboards.
              </p>
            </section>

            <div role="radiogroup" aria-label="Avatars" className="grid grid-cols-3 gap-2.5">
              {OPTIONS.map((o, i) => {
                const checked = i === selectedIndex;
                return (
                  <button
                    key={o.id ?? "initials"}
                    ref={(el) => {
                      tiles.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={o.id === null ? "Use initials" : o.name}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => choose(i)}
                    onKeyDown={(e) => onTileKey(e, i)}
                    className={`relative flex min-h-[88px] min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1 pb-2 pt-2.5 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
                      checked
                        ? "border-signal bg-signal/[0.1] shadow-[0_0_0_1px_var(--color-signal),0_0_18px_-4px_rgba(203,242,77,0.55)]"
                        : "border-white/10 bg-[rgba(16,15,20,0.9)]"
                    }`}
                  >
                    <HexAvatar userId={userId} name={name} avatarId={o.id} size={TILE_HEX} />
                    <span
                      className={`line-clamp-2 break-words text-center text-[12px] font-semibold leading-tight ${
                        checked ? "text-signal" : "text-text-primary"
                      }`}
                    >
                      {o.id === null ? "Use initials" : o.name}
                    </span>
                    {checked && (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-signal text-void"
                      >
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

          </div>
        )}
      </div>

      {/* Outside the scroller so the CTA is reachable from any row and tiles
          clip above it instead of scrolling over the lava band. The lava line
          sits 14.56vh up (26vh canvas, line at 44%) and the wave crest rises
          up to ~18px above it, so 16vh alone lets the crest touch the button;
          the extra 1.5rem keeps a visible gap at every width. */}
      {settingsData && (
        <footer className="flex flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16vh+1.5rem)] pt-2">
          {error && (
            <p role="alert" className="glass rounded-2xl border border-ember/40 px-4 py-2.5 text-sm text-ember">
              {error}
            </p>
          )}
          <button
            onClick={() => void save()}
            disabled={!changed || saving}
            className="cta-lime min-h-[56px] w-full rounded-2xl font-display text-lg font-black uppercase tracking-wide text-void transition-transform active:scale-[0.98] disabled:active:scale-100"
          >
            {saving ? "Saving…" : "Save avatar"}
          </button>
        </footer>
      )}
    </main>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

