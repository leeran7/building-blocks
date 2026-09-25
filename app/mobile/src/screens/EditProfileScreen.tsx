import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import {
  useSettings,
  useDashboard,
  useClearAppData,
  useInvalidateAppData,
  settingsFromResponse,
  type SettingsData,
  type SocialState,
} from "../contexts/AppDataContext";
import {
  tapLight,
  notifySuccess,
  notifyError,
  isHapticsEnabled,
  setHapticsEnabled,
} from "../lib/haptics";
import { hasLeaderboardConsent, setLeaderboardConsent } from "../lib/consent";
import { clearDailyStore } from "../lib/daily";
import { normalizeUsername } from "@app/lib/username";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  normalizeHandle,
} from "@app/lib/socialHandle";
import { SocialMark } from "@app/components/Social/SocialMark";
import { avatarName } from "@app/lib/avatars";
import { HexAvatar } from "../components/HexAvatar";
import { PushHeader, RetryPanel } from "../components/ui";
import { identityNameFor } from "../lib/identity";
import { stashEditProfileDraft, takeEditProfileDraft } from "../lib/editProfileDraft";
import { useBackOr } from "../lib/navigation";
import { useRetry } from "../hooks/useRetry";

const LOAD_FAILED_MESSAGE = "Couldn't load your profile. Check your connection and try again.";

const INPUT =
  "min-h-[48px] w-full rounded-xl border border-white/10 bg-[#0d0c10]/80 px-3.5 text-[15px] text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none";

/**
 * Edit Profile — identity, socials, preferences and the account actions.
 * Pushed from Profile; seeds its form once from the shared settings cache so a
 * background refresh never clobbers an in-progress edit. Unsaved fields survive
 * a trip to the avatar picker (see lib/editProfileDraft).
 *
 * The form only renders once real settings arrived, and Save needs the seed:
 * a PUT from an unseeded (empty) form would null the saved username and
 * socials on the server.
 */
export function EditProfileScreen() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const settingsSlice = useSettings();
  const dashData = useDashboard().data;
  const clearAll = useClearAppData();
  const invalidate = useInvalidateAppData();

  const settingsData = settingsSlice.data;
  const { setSettings, refreshSettings } = settingsSlice;
  const goBack = useBackOr("/profile");
  const settingsRetry = useRetry(refreshSettings);
  const uid = user?.uid;
  const identityName = identityNameFor(settingsData, dashData);

  const [loaded, setLoaded] = useState<SettingsData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [social, setSocial] = useState<SocialState>({});
  const [savedUsername, setSavedUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [haptics, setHaptics] = useState(isHapticsEnabled);
  const [leaderboardVisible, setLeaderboardVisible] = useState(hasLeaderboardConsent);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsData) return;
    seeded.current = true;
    // Coming back from the avatar picker: restore what was typed before it.
    // `loaded` stays the saved values, so the restored edits still read dirty.
    // Taking the draft clears it, so leaving via Back (or saving) and opening
    // Edit Profile again starts from the saved values.
    const draft = uid ? takeEditProfileDraft(uid) : null;
    setLoaded(settingsData);
    setDisplayName(draft?.displayName ?? settingsData.displayName ?? "");
    setUsername(draft?.username ?? settingsData.username ?? "");
    setSavedUsername(settingsData.username ?? "");
    setSocial(draft?.social ?? settingsData.social ?? {});
    setLeaderboardVisible(settingsData.leaderboardConsent ?? false);
  }, [settingsData, uid]);

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

  const usernameCheck = username.trim() ? normalizeUsername(username) : null;

  const dirty = useMemo(() => {
    const socialClean = (o: SocialState) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(o)
            .map(([k, v]) => [k, (v ?? "").trim()])
            .filter(([, v]) => v),
        ),
      );
    return (
      displayName.trim() !== (loaded?.displayName ?? "") ||
      username.trim() !== (loaded?.username ?? "") ||
      socialClean(social) !== socialClean(loaded?.social ?? {})
    );
  }, [displayName, username, social, loaded]);

  const save = async () => {
    if (!loaded) return;
    void tapLight();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          username: username.trim() || null,
          social,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Could not save. Try again.");
        void notifyError();
      } else {
        const next = settingsFromResponse(await res.json().catch(() => null));
        if (!next) {
          setError("Could not save. Try again.");
          void notifyError();
          return;
        }
        setLoaded(next);
        // Re-seed the input buffer from the server-normalized values (it strips
        // "@", lowercases, trims) so `dirty` doesn't stay true after a save when
        // the raw input differed from its normalized form.
        setDisplayName(next.displayName ?? "");
        setUsername(next.username ?? "");
        setSavedUsername(next.username ?? "");
        setSocial(next.social ?? {});
        setSettings(next);
        // The caller's own Friends row renders their display name too.
        invalidate(["leaderboard", "dashboard", "friendsLeaderboard"]);
        setSaved(true);
        void notifySuccess();
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Could not save. Check your connection.");
      void notifyError();
    } finally {
      setSaving(false);
    }
  };

  const canSave = loaded !== null && dirty && !saving && (!usernameCheck || usernameCheck.valid);
  // Stays true through a retry so Try again (and its focus) stays put.
  const loadFailed = !settingsData && (settingsSlice.error || settingsRetry.retrying);

  const signOutNow = async () => {
    void tapLight();
    clearAll();
    await signOut();
    navigate("/");
  };

  const toggleLeaderboard = async () => {
    const next = !leaderboardVisible;
    setLeaderboardVisible(next);
    setLeaderboardConsent(next);
    if (next) void tapLight();
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderboardConsent: next }),
      });
      if (!res.ok) throw new Error("save failed");
      if (settingsData) {
        setSettings({ ...settingsData, leaderboardConsent: next });
      }
      invalidate(["leaderboard"]);
    } catch {
      setLeaderboardVisible(!next);
      setLeaderboardConsent(!next);
      void notifyError();
    }
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
      await signOut();
      navigate("/");
    } catch {
      setDeleteError("Could not delete account. Check your connection.");
      void notifyError();
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <main className="flex h-full flex-col">
      <PushHeader title="Edit profile" onBack={goBack} />

      <div
        className="flex-1 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        {loadFailed ? (
          <RetryPanel
            message={LOAD_FAILED_MESSAGE}
            retrying={settingsRetry.retrying}
            attempts={settingsRetry.attempts}
            onRetry={() => void settingsRetry.retry()}
          >
            <SignOutButton onPress={() => void signOutNow()} />
          </RetryPanel>
        ) : !settingsData ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3" aria-label="Loading profile">
            <div className="h-56 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
            <div className="h-72 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+16vh)]">
            <Section title="Account">
              <div className="flex flex-col gap-4">
                <AvatarRow
                  userId={uid ?? identityName}
                  name={identityName}
                  avatarId={settingsData?.avatarId ?? null}
                  onOpen={() => {
                    void tapLight();
                    if (uid && dirty) stashEditProfileDraft(uid, { displayName, username, social });
                    navigate("/profile/avatar");
                  }}
                />
                <Field label="Display name">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name on the leaderboard"
                    maxLength={60}
                    className={INPUT}
                  />
                </Field>
                <Field label="Public username">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourhandle"
                    maxLength={30}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={usernameCheck ? !usernameCheck.valid : undefined}
                    className={`${INPUT} font-medium`}
                  />
                  <UsernameHint check={usernameCheck} savedUsername={savedUsername} />
                </Field>
              </div>
            </Section>

            <Section title="Social accounts" subtitle="Shown on your public page.">
              <div className="flex flex-col">
                {SOCIAL_PLATFORMS.map((p) => {
                  const value = social[p] ?? "";
                  const check = value.trim() ? normalizeHandle(p, value) : null;
                  const invalid = check ? !check.valid : false;
                  return (
                    <label
                      key={p}
                      className="flex items-center gap-3 border-b border-white/[0.07] py-2 last:border-0"
                    >
                      <span className="flex w-[6.75rem] shrink-0 items-center gap-2.5 text-text-primary">
                        <SocialMark platform={p} className="h-5 w-5 shrink-0" />
                        <span className="text-sm">{PLATFORM_META[p].label}</span>
                      </span>
                      <span
                        className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-1 rounded-xl border bg-[#0d0c10]/80 px-3 focus-within:border-signal ${
                          invalid ? "border-ember/60" : "border-white/10"
                        }`}
                      >
                        <span aria-hidden className="font-mono text-sm text-text-muted">
                          @
                        </span>
                        <input
                          value={value}
                          onChange={(e) => setSocial((s) => ({ ...s, [p]: e.target.value }))}
                          placeholder={PLATFORM_META[p].example}
                          maxLength={PLATFORM_META[p].maxLen + 4}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-label={`${PLATFORM_META[p].label} handle`}
                          aria-invalid={invalid || undefined}
                          className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </Section>

            <Section title="Preferences">
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
              <div className="my-3 h-px bg-white/[0.07]" />
              <Toggle
                label="Leaderboard visibility"
                description="Show your name and peak height on the public leaderboard"
                on={leaderboardVisible}
                onToggle={() => void toggleLeaderboard()}
              />
            </Section>

            {error && (
              <p role="alert" className="px-1 text-sm text-ember">
                {error}
              </p>
            )}

            <button
              onClick={save}
              disabled={!canSave}
              className="cta-lime mt-1 min-h-[56px] w-full rounded-2xl font-display text-lg font-black uppercase tracking-wide text-void transition-transform active:scale-[0.98] disabled:active:scale-100"
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
            </button>

            <SignOutButton onPress={() => void signOutNow()} />

            {!deleteConfirm ? (
              <button
                ref={deleteTriggerRef}
                type="button"
                onClick={() => {
                  void tapLight();
                  setDeleteConfirm(true);
                  setDeleteError(null);
                }}
                className="mx-auto min-h-[44px] px-4 text-[15px] font-medium text-ember transition-opacity active:opacity-70"
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
                className="glass rounded-3xl border border-ember/40 p-5 outline-none"
              >
                <p className="font-display text-base font-black uppercase tracking-wide text-text-primary">
                  Delete account?
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                  Your profile, climb history, and social links will be permanently removed. This cannot be undone.
                </p>
                {deleteError && (
                  <p role="alert" className="mt-2 text-xs text-ember">
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
                    className="min-h-[48px] flex-1 rounded-2xl border border-white/10 text-sm font-semibold text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deleteAccount}
                    disabled={deleting}
                    className="min-h-[48px] flex-1 rounded-2xl bg-ember text-sm font-bold uppercase tracking-wide text-white disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function SignOutButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="glass min-h-[50px] w-full rounded-2xl border border-white/10 text-[15px] font-semibold text-text-primary transition-transform active:scale-[0.98]"
    >
      Sign out
    </button>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="glass rounded-3xl border border-white/10 px-5 pb-5 pt-4">
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-text-secondary">{title}</h2>
      {subtitle && <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AvatarRow({
  userId,
  name,
  avatarId,
  onOpen,
}: {
  userId: string;
  name: string;
  avatarId: string | null;
  onOpen: () => void;
}) {
  const current = avatarName(avatarId) ?? "Initials";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Avatar: ${current}. Change avatar`}
      className="-mx-1 flex min-h-[56px] items-center gap-3 rounded-2xl px-1 text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      <HexAvatar userId={userId} name={name} avatarId={avatarId} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-primary">Avatar</span>
        <span className="block truncate text-[13px] text-text-secondary">{current}</span>
      </span>
      <ChevronRight />
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  description,
  on,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[15px] font-semibold text-text-primary">{label}</p>
        <p className="mt-0.5 text-[13px] text-text-secondary">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
          on ? "bg-signal shadow-[0_0_14px_rgba(203,242,77,0.45)]" : "bg-border-strong"
        }`}
      >
        <span
          className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-[left] duration-200"
          style={{ left: on ? 28 : 4 }}
        />
      </button>
    </div>
  );
}

function UsernameHint({
  check,
  savedUsername,
}: {
  check: ReturnType<typeof normalizeUsername> | null;
  savedUsername: string;
}) {
  if (!check) return null;
  if (!check.valid) {
    return <p className="text-xs text-ember">{check.error}</p>;
  }
  const isSaved = check.username === savedUsername;
  return (
    <p className="text-[13px] text-text-secondary">
      {isSaved ? "Your page: " : "Your page will be "}
      <button
        type="button"
        onClick={() => {
          if (!isSaved) return;
          void tapLight();
          void openExternal(`${API_BASE}/c/${check.username}`);
        }}
        className={`font-mono ${isSaved ? "text-signal underline underline-offset-2" : "text-text-primary"}`}
      >
        /c/{check.username}
        {isSaved ? " ↗" : ""}
      </button>
      {!isSaved && " — save to create it."}
    </p>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

