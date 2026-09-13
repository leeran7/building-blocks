import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreatorPlatform } from "@prisma/client";
import { apiFetch, API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import { tapLight, notifySuccess, notifyError } from "../lib/haptics";
import { ScreenHeader, ScreenBody, Card, Button } from "../components/ui";
import { normalizeUsername } from "@app/lib/username";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  normalizeHandle,
} from "@app/lib/socialHandle";
import { SocialMark } from "@app/components/Social/SocialMark";

type SocialState = Partial<Record<CreatorPlatform, string>>;

interface Settings {
  displayName: string | null;
  username: string | null;
  social: SocialState | null;
  urls: string[] | null;
}

const EMPTY: Settings = { displayName: null, username: null, social: null, urls: null };

export function SettingsScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();

  const [loaded, setLoaded] = useState<Settings>(EMPTY);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [social, setSocial] = useState<SocialState>({});
  const [savedUsername, setSavedUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAnonymous) {
      setLoading(false);
      return;
    }
    let alive = true;
    apiFetch("/api/settings")
      .then((r) => r.json())
      .then((d: Settings) => {
        if (!alive) return;
        const s: Settings = {
          displayName: d.displayName ?? null,
          username: d.username ?? null,
          social: d.social && typeof d.social === "object" ? d.social : null,
          urls: Array.isArray(d.urls) ? d.urls : null,
        };
        setLoaded(s);
        setDisplayName(s.displayName ?? "");
        setUsername(s.username ?? "");
        setSavedUsername(s.username ?? "");
        setSocial(s.social ?? {});
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user, isAnonymous]);

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
      displayName.trim() !== (loaded.displayName ?? "") ||
      username.trim() !== (loaded.username ?? "") ||
      socialClean(social) !== socialClean(loaded.social ?? {})
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
        const s: Settings = await res.json();
        setLoaded({
          displayName: s.displayName ?? null,
          username: s.username ?? null,
          social: s.social ?? null,
          urls: s.urls ?? null,
        });
        setSavedUsername(s.username ?? "");
        setSocial(s.social ?? {});
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

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <ScreenHeader eyebrow="your profile" title="Settings" onBack={() => navigate("/profile")} />

      <ScreenBody>
        {loading ? (
          <div className="flex flex-col gap-3 pt-1">
            <div className="h-32 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
            <div className="h-40 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            {/* Identity */}
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
                        className={`flex min-h-[44px] flex-1 items-center gap-1 rounded-xl border bg-elevated px-3 focus-within:border-signal ${
                          invalid ? "border-ember/60" : "border-border-strong"
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

            {error && (
              <p role="alert" className="px-1 text-sm text-ember">
                {error}
              </p>
            )}

            <Button onPress={save} disabled={!canSave} busy={saving}>
              {saved ? "Saved!" : "Save Changes"}
            </Button>
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
