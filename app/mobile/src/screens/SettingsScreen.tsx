import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useSettings, useClearAppData } from "../contexts/AppDataContext";
import { tapLight, notifyError, isHapticsEnabled, setHapticsEnabled } from "../lib/haptics";
import { hasLeaderboardConsent } from "../lib/consent";
import { clearDailyStore } from "@app/lib/daily";
import { clearClimbBest } from "@app/lib/climbBest";
import { ControlSchemePicker } from "@app/components/ControlSchemePicker";
import { isSfxMuted, setSfxMuted } from "@app/components/Game/sfxMute";
import { GlassSection, PushHeader, RetryPanel, Toggle } from "../components/ui";
import { useBackOr } from "../lib/navigation";
import { useRetry } from "../hooks/useRetry";
import { useSaveLeaderboardConsent } from "../hooks/useAcceptLeaderboardConsent";

/** The visibility toggle flipped back: the PUT failed, or its 200 did not echo the value. */
export const VISIBILITY_NOT_SAVED = "Couldn't save your leaderboard visibility. Try again.";
const VISIBILITY_LOAD_FAILED = "Couldn't load your leaderboard visibility. Check your connection and try again.";

/**
 * Settings — game preferences, privacy and the account actions. Pushed from
 * the gear on Profile. Controls, sound and haptics are device-local and save
 * on change, so they render at once, even offline. Only leaderboard
 * visibility comes from the server, so only its card waits on the settings
 * load (and offers Try again when it fails).
 */
export function SettingsScreen() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const settingsSlice = useSettings();
  const clearAll = useClearAppData();
  const saveConsent = useSaveLeaderboardConsent();

  const settingsData = settingsSlice.data;
  const { refreshSettings } = settingsSlice;
  const goBack = useBackOr("/profile");
  // Only the Privacy card waits on the settings load, so a recovered load
  // puts focus back on that card, not the top of the page.
  const privacyHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsRetry = useRetry(refreshSettings, {
    failed: settingsSlice.error,
    hasData: settingsData !== null,
    focusOnRecover: privacyHeadingRef,
  });

  const [soundOn, setSoundOn] = useState(() => !isSfxMuted());
  const [haptics, setHaptics] = useState(isHapticsEnabled);
  const [leaderboardVisible, setLeaderboardVisible] = useState(hasLeaderboardConsent);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Seed visibility once from the server; a later background refresh never
  // overrides a toggle the player just made.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsData) return;
    seeded.current = true;
    setLeaderboardVisible(settingsData.leaderboardConsent ?? false);
  }, [settingsData]);

  // Delete-confirm focus management: move focus into the warning when it opens
  // (so it's announced to VoiceOver/switch users) and restore it to the trigger
  // on cancel. Guarded so it never steals focus on the initial render.
  const confirmRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const prevConfirm = useRef(false);
  useEffect(() => {
    if (deleteConfirm) confirmRef.current?.focus();
    else if (prevConfirm.current) deleteTriggerRef.current?.focus();
    prevConfirm.current = deleteConfirm;
  }, [deleteConfirm]);
  // A failed delete keeps the confirm open with its error inside. Delete was
  // disabled while the request ran, which drops focus to <body>, so bring it
  // back into the confirm where the error is read out.
  useEffect(() => {
    if (deleteError) confirmRef.current?.focus();
  }, [deleteError]);

  const signOutNow = async () => {
    void tapLight();
    clearAll();
    await signOut();
    navigate("/");
  };

  // Flips at once; flips back with a message unless the server echoes it.
  const toggleLeaderboard = async () => {
    const next = !leaderboardVisible;
    setLeaderboardVisible(next);
    setVisibilityError(null);
    if (next) void tapLight();
    if (await saveConsent(next)) return;
    setLeaderboardVisible(!next);
    setVisibilityError(VISIBILITY_NOT_SAVED);
    void notifyError();
  };

  const deleteAccount = async () => {
    void tapLight();
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteError((d as { error?: string }).error ?? "Could not delete account. Try again.");
        void notifyError();
        return;
      }
      clearAll();
      clearDailyStore(); // device-local streak isn't account-scoped; wipe on delete
      clearClimbBest();
      await signOut();
      navigate("/");
    } catch {
      setDeleteError("Could not delete account. Check your connection.");
      void notifyError();
    } finally {
      // The confirm stays open after a failure: the error renders inside it.
      setDeleting(false);
    }
  };

  return (
    <main className="flex h-full flex-col">
      <PushHeader title="Settings" onBack={goBack} />

      <div
        className="flex-1 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        <div className="flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+16vh)]">
          <GlassSection title="Game">
            <p id="control-scheme-label" className="text-body font-semibold text-text-primary">
              Game controls
            </p>
            <p className="mb-3 mt-0.5 text-meta text-text-secondary">On-screen buttons or a joystick</p>
            <ControlSchemePicker labelledBy="control-scheme-label" />
            <div className="my-3 h-px bg-white/[0.07]" />
            <Toggle
              label="Sound"
              description="Music and sound effects in runs"
              on={soundOn}
              onToggle={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSfxMuted(!next);
                void tapLight();
              }}
            />
            <div className="my-3 h-px bg-white/[0.07]" />
            <Toggle
              label="Haptic feedback"
              description="Vibration on taps and game events"
              on={haptics}
              onToggle={() => {
                const next = !haptics;
                setHaptics(next);
                setHapticsEnabled(next);
                if (next) void tapLight();
              }}
            />
          </GlassSection>

          <GlassSection title="Privacy" headingRef={privacyHeadingRef}>
            {settingsRetry.showError ? (
              <RetryPanel
                message={VISIBILITY_LOAD_FAILED}
                retrying={settingsRetry.retrying}
                attempts={settingsRetry.attempts}
                onRetry={() => void settingsRetry.retry()}
              />
            ) : !settingsData ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="Loading leaderboard visibility"
                className="h-14 animate-pulse rounded-2xl bg-surface/60"
              />
            ) : (
              <>
                <Toggle
                  label="Leaderboard visibility"
                  description="Show your name and peak height on the public leaderboard"
                  on={leaderboardVisible}
                  onToggle={() => void toggleLeaderboard()}
                />
                {visibilityError && (
                  <p role="alert" className="mt-2 text-meta text-ember">
                    {visibilityError}
                  </p>
                )}
              </>
            )}
          </GlassSection>

          <GlassSection title="Account">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void signOutNow()}
                className="glass min-h-[50px] w-full rounded-2xl border border-white/10 text-body font-semibold text-text-primary transition-transform active:scale-[0.98]"
              >
                Sign out
              </button>

              {!deleteConfirm ? (
                <button
                  ref={deleteTriggerRef}
                  type="button"
                  onClick={() => {
                    void tapLight();
                    setDeleteConfirm(true);
                    setDeleteError(null);
                  }}
                  className="mx-auto min-h-[44px] px-4 text-body font-medium text-ember transition-opacity active:opacity-70"
                >
                  Delete account
                </button>
              ) : (
                <div
                  ref={confirmRef}
                  tabIndex={-1}
                  role="alertdialog"
                  aria-modal="false"
                  aria-label="Confirm account deletion"
                  className="rounded-2xl border border-ember/40 p-4 outline-none"
                >
                  <p className="font-display text-base font-black uppercase tracking-wide text-text-primary">
                    Delete account?
                  </p>
                  <p className="mt-1 text-meta leading-relaxed text-text-secondary">
                    Your profile, climb history, and social links will be permanently removed. This cannot be undone.
                  </p>
                  {deleteError && (
                    <p role="alert" className="mt-2 text-meta text-ember">
                      {deleteError}
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => {
                        void tapLight();
                        setDeleteConfirm(false);
                        setDeleteError(null);
                      }}
                      disabled={deleting}
                      className="min-h-[48px] flex-1 rounded-2xl border border-white/10 text-meta font-semibold text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={deleteAccount}
                      disabled={deleting}
                      className="min-h-[48px] flex-1 rounded-2xl bg-ember text-meta font-bold uppercase tracking-wide text-white disabled:opacity-60"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </GlassSection>
        </div>
      </div>
    </main>
  );
}
