"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreatorPlatform } from "@prisma/client";
import { Navbar } from "../../src/components/Navbar";
import { useAuth } from "../../src/contexts/AuthContext";
import { SIGNIN_HREF } from "../../src/components/navLinks";
import { normalizeUsername, suggestUsername } from "../../src/lib/username";
import { SocialMark } from "../../src/components/Social/SocialMark";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  normalizeHandle,
} from "../../src/lib/socialHandle";
import type { UserSettings } from "../../src/db/settings";

type SocialState = Partial<Record<CreatorPlatform, string>>;

const INPUT =
  "w-full bg-surface-raised border border-border-strong rounded-lg px-4 py-3 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-colors";

interface Props {
  initialData: UserSettings | null;
}

export function SettingsForm({ initialData }: Props) {
  const router = useRouter();
  const { user, token, loading } = useAuth();

  const [displayName, setDisplayName] = useState(initialData?.displayName ?? "");
  const [username, setUsername] = useState(
    initialData?.username ?? suggestUsername(initialData?.displayName ?? "")
  );
  const [savedUsername, setSavedUsername] = useState(initialData?.username ?? "");
  const [social, setSocial] = useState<SocialState>(
    (initialData?.social as SocialState | undefined) ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Auth gate — redirect unauthenticated users.
  useEffect(() => {
    if (!loading && !user) router.push(`${SIGNIN_HREF}?redirect=%2Fsettings`);
  }, [loading, user, router]);

  // Client-side fetch only runs when the server couldn't pre-populate
  // (i.e. the firebaseToken cookie was absent or expired at request time).
  useEffect(() => {
    if (!token || initialData !== null) return;
    let live = true;
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (live && s) {
          setDisplayName(s.displayName ?? "");
          setUsername(s.username ?? suggestUsername(s.displayName ?? ""));
          setSavedUsername(s.username ?? "");
          setSocial(s.social && typeof s.social === "object" ? s.social : {});
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [token, initialData]);

  const usernameCheck = username.trim() ? normalizeUsername(username) : null;

  async function save() {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName, username, social }),
      });
      if (res.ok) {
        const s = await res.json();
        setDisplayName(s.displayName ?? "");
        setUsername(s.username ?? "");
        setSavedUsername(s.username ?? "");
        setSocial(s.social && typeof s.social === "object" ? s.social : {});
        setMsg({ type: "ok", text: "Settings saved." });
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: e.error ?? "Couldn't save settings." });
      }
    } catch {
      setMsg({ type: "err", text: "Couldn't save settings." });
    } finally {
      setSaving(false);
    }
  }

  // Show spinner only when we have no server data and client auth hasn't resolved.
  if (initialData === null && (loading || !user)) {
    return (
      <main id="main-content" className="grain topo min-h-screen bg-void">
        <Navbar contextLabel="Settings" />
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="grain topo min-h-screen bg-void">
      <Navbar contextLabel="Settings" />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ your profile ]
        </span>
        <h1 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-2">
          Set your display name, create your creator page, and save the social
          accounts you list often.
        </p>

        {/* Display name */}
        <section className="mt-10 rounded-2xl border border-border-strong bg-surface p-6 shadow-lifted edge-signal">
          <label
            htmlFor="display-name"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Acme Labs"
            maxLength={60}
            className={`${INPUT} mt-2`}
          />
        </section>

        {/* Username / public creator page */}
        <section className="mt-6 rounded-2xl border border-border-strong bg-surface p-6 shadow-lifted">
          <label
            htmlFor="username"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            Public username
          </label>
          <p className="text-xs text-text-secondary mt-1">
            Creates your public creator page. Leave blank for none.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-sm text-text-secondary">/c/</span>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourname"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${INPUT} font-mono`}
              aria-invalid={usernameCheck ? !usernameCheck.valid : undefined}
            />
          </div>
          {usernameCheck &&
            (!usernameCheck.valid ? (
              <p className="text-xs text-ember mt-2">{usernameCheck.error}</p>
            ) : usernameCheck.username === savedUsername ? (
              <p className="text-xs text-text-secondary mt-2">
                Your page:{" "}
                <Link
                  href={`/c/${usernameCheck.username}`}
                  className="font-mono text-signal hover:brightness-110 underline-offset-2 hover:underline"
                >
                  /c/{usernameCheck.username} ↗
                </Link>
              </p>
            ) : (
              <p className="text-xs text-text-secondary mt-2">
                Your page will be{" "}
                <span className="font-mono text-text-primary">
                  /c/{usernameCheck.username}
                </span>{" "}
                — Save to create it.
              </p>
            ))}
        </section>

        {/* Social accounts */}
        <section className="mt-6 rounded-2xl border border-border-strong bg-surface p-6 shadow-lifted">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Social accounts
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Shown as chips on your creator page and prefilled when you list that
            platform.
          </p>
          <div className="mt-4">
            {SOCIAL_PLATFORMS.map((p) => {
              const value = social[p] ?? "";
              const check = value.trim() ? normalizeHandle(p, value) : null;
              return (
                <div
                  key={p}
                  className="grid grid-cols-[7rem_1fr] items-center gap-3 py-2.5 border-b border-border-subtle last:border-0"
                >
                  <span className="flex items-center gap-2 text-text-secondary">
                    <SocialMark platform={p} className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{PLATFORM_META[p].label}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="font-mono text-text-muted">
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
                      aria-invalid={check ? !check.valid : undefined}
                      className={`${INPUT} font-mono py-2 ${
                        check && !check.valid ? "border-ember/60" : ""
                      }`}
                    />
                    {check && !check.valid && (
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ember whitespace-nowrap">
                        ⚠
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Save */}
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-signal text-void font-semibold rounded-full px-7 min-h-[48px] shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Save settings"
            )}
          </button>
          {msg && (
            <span
              role="status"
              className={`font-mono text-xs uppercase tracking-[0.12em] ${
                msg.type === "ok" ? "text-signal" : "text-ember"
              }`}
            >
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
