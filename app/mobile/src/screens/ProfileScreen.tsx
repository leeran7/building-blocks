import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import {
  useDashboard,
  useSettings,
  useClearAppData,
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
import { dailySummary, clearDailyStore } from "../lib/daily";
import { ScreenHeader, ScreenBody, Card, StatCard, Button } from "../components/ui";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { normalizeUsername } from "@app/lib/username";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  normalizeHandle,
} from "@app/lib/socialHandle";
import { SocialMark } from "@app/components/Social/SocialMark";

/**
 * "You" — the merged profile + settings screen. Shows the player's saved
 * identity and standing up top (read), then editable identity / socials /
 * preferences and the account actions (Sign Out, Delete) below. Reads both the
 * dashboard and settings from the shared AppData cache, so the same record is
 * never fetched twice and revisits render instantly.
 */
export function ProfileScreen() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const dash = useDashboard();
  const settingsSlice = useSettings();
  const clearAll = useClearAppData();

  const dashData = dash.data;
  const settingsData = settingsSlice.data;
  const { setSettings } = settingsSlice;

  const streak = dailySummary().streak;

  // Editable form buffer + its saved baseline. Seeded once from the cache when
  // it first arrives (or immediately on a warm revisit) so background refreshes
  // never clobber an in-progress edit.
  const [loaded, setLoaded] = useState<SettingsData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [social, setSocial] = useState<SocialState>({});
  const [savedUsername, setSavedUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [haptics, setHaptics] = useState(isHapticsEnabled);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settingsData) return;
    seeded.current = true;
    setLoaded(settingsData);
    setDisplayName(settingsData.displayName ?? "");
    setUsername(settingsData.username ?? "");
    setSavedUsername(settingsData.username ?? "");
    setSocial(settingsData.social ?? {});
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
        const s: SettingsData = await res.json();
        const next: SettingsData = {
          displayName: s.displayName ?? null,
          username: s.username ?? null,
          social: s.social ?? null,
          urls: s.urls ?? null,
        };
        setLoaded(next);
        // Re-seed the input buffer from the server-normalized values (it strips
        // "@", lowercases, trims) so `dirty` doesn't stay true after a save when
        // the raw input differed from its normalized form.
        setDisplayName(next.displayName ?? "");
        setUsername(next.username ?? "");
        setSavedUsername(next.username ?? "");
        setSocial(next.social ?? {});
        setSettings(next); // update the shared cache so the identity card reflects it
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

  const canSave = dirty && !saving && (!usernameCheck || usernameCheck.valid);

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

  const climb = dashData?.freeClimb ?? null;
  const identityName =
    settingsData?.displayName || climb?.handle || dashData?.user.email || "Player";
  const identityUsername = settingsData?.username ?? dashData?.user.username ?? null;
  const initial = identityName.charAt(0).toUpperCase();
  const topPct =
    climb && climb.totalClimbers
      ? Math.max(1, Math.round((climb.rank / climb.totalClimbers) * 100))
      : null;

  // Cold-load skeleton only; warm revisits render straight from cache. (The app
  // is auth-gated in App.tsx, so this screen only ever renders for a real user.)
  const loading = dash.loading || settingsSlice.loading;

  return (
    <main className="flex h-full flex-col">
      <ScreenHeader eyebrow="your account" title="Profile" />

      <ScreenBody>
        {loading ? (
          <div className="flex flex-col gap-3 pt-1">
            <div className="h-24 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
            <div className="h-40 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
            <div className="h-20 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-1 pb-8">
            {/* Identity (view) */}
            <Card>
              <div className="flex items-center gap-4">
                <span className="hm-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-3xl font-black text-void">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-black text-text-primary">
                    {identityName}
                  </p>
                  {identityUsername && (
                    <p className="truncate font-mono text-xs text-signal">
                      @{identityUsername}
                    </p>
                  )}
                  {dashData?.user.email && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-text-secondary">
                      {dashData.user.email}
                    </p>
                  )}
                </div>
              </div>
              <style>{`
                .hm-avatar {
                  background: linear-gradient(140deg, var(--color-signal), #a6c93a);
                  box-shadow: 0 8px 30px -10px color-mix(in srgb, var(--color-signal) 55%, transparent);
                }
              `}</style>
            </Card>

            {/* Best-climb spotlight */}
            {climb ? (
              <Card highlight>
                <p className="text-center font-mono text-[10px] uppercase tracking-[0.3em] text-text-secondary">
                  Best climb
                </p>
                <p className="mt-2 text-center font-mono text-5xl font-bold leading-none tabular-nums text-signal">
                  {climb.peakY.toLocaleString()}
                  <span className="ml-1 align-baseline text-xl font-normal text-text-secondary">
                    {ALTITUDE_UNIT}
                  </span>
                </p>
                <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                  #{climb.rank}
                  {climb.totalClimbers
                    ? ` of ${climb.totalClimbers.toLocaleString()}`
                    : ""}
                  {topPct ? ` · top ${topPct}%` : ""}
                </p>
              </Card>
            ) : (
              <Card>
                <p className="py-2 text-center text-sm text-text-secondary">
                  No climbs yet — hit Play to set your first record.
                </p>
                <Button onPress={() => navigate("/climb")}>Play now</Button>
              </Card>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Wins" value={String(climb?.wins ?? 0)} />
              <StatCard
                label="Daily streak"
                value={streak > 0 ? `${streak}🔥` : "—"}
                accent={streak > 0}
              />
            </div>

            {/* Identity (edit) */}
            <Card>
              <div className="flex flex-col gap-4">
                <Field label="Display Name">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name on the leaderboard"
                    maxLength={60}
                    className={INPUT}
                  />
                </Field>

                <Field label="Public Username">
                  <div className="flex min-h-[48px] items-center gap-1.5 rounded-xl border border-border-strong bg-elevated px-3.5 focus-within:border-signal">
                    <span className="font-mono text-sm text-text-muted">/c/</span>
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
                      className="flex-1 bg-transparent py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                    />
                  </div>
                  <UsernameHint check={usernameCheck} savedUsername={savedUsername} />
                </Field>
              </div>
            </Card>

            {/* Social accounts */}
            <Card>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                Social Accounts
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                Shown as chips on your public creator page.
              </p>
              <div className="mt-3 flex flex-col">
                {SOCIAL_PLATFORMS.map((p) => {
                  const value = social[p] ?? "";
                  const check = value.trim() ? normalizeHandle(p, value) : null;
                  const invalid = check ? !check.valid : false;
                  return (
                    <label
                      key={p}
                      className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0"
                    >
                      <span className="flex w-20 shrink-0 items-center gap-2 text-text-secondary">
                        <SocialMark platform={p} className="h-4 w-4 shrink-0" />
                        <span className="truncate text-xs">{PLATFORM_META[p].label}</span>
                      </span>
                      <span
                        className={`flex min-h-[44px] flex-1 items-center gap-1 rounded-xl border bg-elevated px-3 focus-within:border-signal ${invalid ? "border-ember/60" : "border-border-strong"
                          }`}
                      >
                        <span aria-hidden className="font-mono text-sm text-text-muted">
                          @
                        </span>
                        <input
                          value={value}
                          onChange={(e) =>
                            setSocial((s) => ({ ...s, [p]: e.target.value }))
                          }
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
            </Card>

            {/* Preferences */}
            <Card>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                Preferences
              </p>
              <div className="mt-3 flex items-center justify-between gap-4 py-1">
                <div>
                  <p className="text-sm font-medium text-text-primary">Haptic feedback</p>
                  <p className="mt-0.5 text-xs text-text-muted">Vibration on taps and game events</p>
                </div>
                <button
                  role="switch"
                  aria-checked={haptics}
                  onClick={() => {
                    const next = !haptics;
                    setHaptics(next);
                    setHapticsEnabled(next);
                    if (next) void tapLight();
                  }}
                  className={`relative h-7 w-13 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void ${haptics ? "bg-signal" : "bg-border-strong"
                    }`}
                >
                  <span
                    className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-[left] duration-200"
                    style={{ left: haptics ? 26 : 2 }}
                  />
                </button>
              </div>
            </Card>

            {error && (
              <p role="alert" className="px-1 text-sm text-ember">
                {error}
              </p>
            )}

            <Button onPress={save} disabled={!canSave} busy={saving}>
              {saved ? "Saved!" : "Save Changes"}
            </Button>

            {identityUsername && (
              <Button
                variant="secondary"
                onPress={() => {
                  void tapLight();
                  void openExternal(`${API_BASE}/c/${identityUsername}`);
                }}
              >
                View public page ↗
              </Button>
            )}

            <Button
              variant="secondary"
              onPress={async () => {
                void tapLight();
                clearAll();
                await signOut();
                navigate("/");
              }}
              style={{ color: "var(--color-ember)" }}
            >
              Sign Out
            </Button>

            {!deleteConfirm ? (
              <button
                ref={deleteTriggerRef}
                type="button"
                onClick={() => { void tapLight(); setDeleteConfirm(true); setDeleteError(null); }}
                className="my-12 py-2 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-white transition-colors active:text-ember"
              >
                Delete Account
              </button>
            ) : (
              <div
                ref={confirmRef}
                tabIndex={-1}
                role="alertdialog"
                aria-modal="false"
                aria-label="Confirm account deletion"
                className="outline-none"
              >
              <Card>
                <p className="text-sm font-medium text-text-primary">Delete account?</p>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  Your profile, climb history, and social links will be permanently removed. This cannot be undone.
                </p>
                {deleteError && (
                  <p role="alert" className="mt-2 text-xs text-ember">{deleteError}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    className="flex-1"
                    onPress={() => { void tapLight(); setDeleteConfirm(false); setDeleteError(null); }}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    fullWidth={false}
                    className="flex-1"
                    onPress={deleteAccount}
                    busy={deleting}
                    disabled={deleting}
                    style={{ background: "var(--color-ember)", color: "#fff" }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
              </div>
            )}
          </div>
        )}
      </ScreenBody>
    </main>
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
    return <p className="mt-2 text-xs text-ember">{check.error}</p>;
  }
  const isSaved = check.username === savedUsername;
  return (
    <p className="mt-2 text-xs text-text-secondary">
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

const INPUT =
  "min-h-[48px] rounded-xl border border-border-strong bg-elevated px-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
