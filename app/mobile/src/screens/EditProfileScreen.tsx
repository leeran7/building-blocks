import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { riseIn, sharedId, spring } from "../lib/motionTokens";
import { apiFetch, API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import {
  useSettings,
  useDashboard,
  useInvalidateAppData,
  settingsFromResponse,
  type SettingsData,
  type SocialState,
} from "../contexts/AppDataContext";
import { tapLight, notifySuccess, notifyError } from "../lib/haptics";
import { normalizeUsername } from "@app/lib/username";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  normalizeHandle,
} from "@app/lib/socialHandle";
import { SocialMark } from "@app/components/Social/SocialMark";
import { HexAvatar } from "../components/HexAvatar";
import { GlassSection as Section, PushHeader, RetryPanel } from "../components/ui";
import { avatarButtonLabel, avatarLabel, identityNameFor } from "../lib/identity";
import { stashEditProfileDraft, takeEditProfileDraft } from "../lib/editProfileDraft";
import { useBackOr } from "../lib/navigation";
import { useRetry } from "../hooks/useRetry";

const LOAD_FAILED_MESSAGE = "Couldn't load your profile. Check your connection and try again.";

const INPUT =
  "min-h-[48px] w-full rounded-xl border border-white/10 bg-[#0d0c10]/80 px-3.5 text-body text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none";

/**
 * Edit Profile — identity and socials. Preferences and the account actions
 * live on Settings (the gear on Profile). Pushed from Profile; seeds its form
 * once from the shared settings cache so a background refresh never clobbers
 * an in-progress edit. Unsaved fields survive a trip to the avatar picker (see
 * lib/editProfileDraft).
 *
 * The form only renders once real settings arrived, and Save needs the seed:
 * a PUT from an unseeded (empty) form would null the saved username and
 * socials on the server.
 */
export function EditProfileScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const settingsSlice = useSettings();
  const dashData = useDashboard().data;
  const invalidate = useInvalidateAppData();

  const settingsData = settingsSlice.data;
  const { setSettings, refreshSettings } = settingsSlice;
  const goBack = useBackOr("/profile");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingsRetry = useRetry(refreshSettings, {
    failed: settingsSlice.error,
    hasData: settingsData !== null,
    focusOnRecover: headingRef,
  });
  const uid = user?.uid;
  const identityName = identityNameFor(settingsData, dashData, uid);
  // The name an empty Display name saves as (the server stores null): the
  // pseudonym, whose animal follows the saved avatar. It is only the placeholder,
  // never the value, so saving a pseudonymous player still sends null.
  const pseudonym = identityNameFor(settingsData && { ...settingsData, displayName: null }, dashData, uid);

  const [loaded, setLoaded] = useState<SettingsData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [social, setSocial] = useState<SocialState>({});
  const [savedUsername, setSavedUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [settingsData, uid]);

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
  const loadFailed = settingsRetry.showError;

  return (
    <main className="flex h-full flex-col">
      <PushHeader title="Edit profile" onBack={goBack} headingRef={headingRef} />

      {/* layoutScroll: the avatar flies to Choose character from where it is
          scrolled to. The sections rise in around the avatar flying in from Profile. */}
      <motion.div
        layoutScroll
        initial="hidden"
        animate="shown"
        className="flex-1 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        {loadFailed ? (
          <RetryPanel
            message={LOAD_FAILED_MESSAGE}
            retrying={settingsRetry.retrying}
            attempts={settingsRetry.attempts}
            onRetry={() => void settingsRetry.retry()}
          />
        ) : !settingsData ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3" aria-label="Loading profile">
            <div className="h-56 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
            <div className="h-72 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+16vh)]">
            <motion.div variants={riseIn} custom={0}>
              <Section title="Identity">
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
                      placeholder={pseudonym}
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
            </motion.div>

            <motion.div variants={riseIn} custom={1}>
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
                          <span className="text-meta">{PLATFORM_META[p].label}</span>
                        </span>
                        <span
                          className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-1 rounded-xl border bg-[#0d0c10]/80 px-3 focus-within:border-signal ${
                            invalid ? "border-ember/60" : "border-white/10"
                          }`}
                        >
                          <span aria-hidden className="font-mono text-meta text-text-muted">
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
                            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-meta text-text-primary placeholder:text-text-muted focus:outline-none"
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Section>
            </motion.div>

            {error && (
              <p role="alert" className="px-1 text-meta text-ember">
                {error}
              </p>
            )}

            <button
              onClick={save}
              disabled={!canSave}
              className="cta-lime mt-1 min-h-[56px] w-full rounded-2xl font-display text-lead font-black uppercase tracking-wide text-void transition-transform active:scale-[0.98] disabled:active:scale-100"
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
            </button>

          </div>
        )}
      </motion.div>
    </main>
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
  const current = avatarLabel(avatarId);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={avatarButtonLabel(avatarId)}
      className="-mx-1 flex min-h-[56px] items-center gap-3 rounded-2xl px-1 text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      {/* Profile's avatar flies into this one, and this one on into Choose character (sharedId). */}
      <motion.span layoutId={sharedId.myAvatar} layoutCrossfade={false} transition={spring.smooth} className="flex">
        <HexAvatar userId={userId} name={name} avatarId={avatarId} size={48} />
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-text-primary">Character</span>
        <span className="block truncate text-meta text-text-secondary">{current}</span>
      </span>
      <ChevronRight />
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-meta font-medium text-text-primary">{label}</span>
      {children}
    </label>
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
    return <p className="text-meta text-ember">{check.error}</p>;
  }
  const isSaved = check.username === savedUsername;
  return (
    <p className="text-meta text-text-secondary">
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

