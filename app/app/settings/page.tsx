"use client";

/**
 * /settings — profile display name + saved URLs.
 *
 * Auth-gated. Loads the user's settings, lets them edit their display name and
 * manage a list of URLs they can reuse at submit time. Saves via PUT /api/settings.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "../../src/components/Navbar";
import { useAuth } from "../../src/contexts/AuthContext";
import { normalizeUsername } from "../../src/lib/username";

const INPUT =
  "w-full bg-surface-raised border border-border-strong rounded-lg px-4 py-3 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-colors";

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Auth gate
  useEffect(() => {
    if (!loading && !user) router.push("/auth/signin?redirect=%2Fsettings");
  }, [loading, user, router]);

  // Load settings
  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (live && s) {
          setDisplayName(s.displayName ?? "");
          setUsername(s.username ?? "");
          setUrls(Array.isArray(s.urls) ? s.urls : []);
        }
        if (live) setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [token]);

  // Live preview mirrors the server's normalizer so it never shows an invalid
  // URL (e.g. "/c/@Foo!") or a reserved/too-short name as if it will work.
  const usernameCheck = username.trim() ? normalizeUsername(username) : null;

  function addUrl() {
    const u = newUrl.trim();
    if (!u) return;
    if (!urls.includes(u)) setUrls([...urls, u]);
    setNewUrl("");
    setMsg(null);
  }

  function removeUrl(u: string) {
    setUrls(urls.filter((x) => x !== u));
    setMsg(null);
  }

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
        body: JSON.stringify({ displayName, username, urls }),
      });
      if (res.ok) {
        const s = await res.json();
        setDisplayName(s.displayName ?? "");
        setUsername(s.username ?? "");
        setUrls(Array.isArray(s.urls) ? s.urls : []);
        setMsg({ type: "ok", text: "Settings saved." });
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: e.error ?? "Couldn’t save settings." });
      }
    } catch {
      setMsg({ type: "err", text: "Couldn’t save settings." });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <main id="main-content" className="grain min-h-screen bg-void">
        <Navbar contextLabel="Settings" />
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="grain min-h-screen bg-void">
      <Navbar contextLabel="Settings" />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ your profile ]
        </span>
        <h1 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
          Settings
        </h1>
        <p className="text-sm text-text-muted mt-2">
          Set a display name and save the URLs you list often.
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
            Claims your public creator page. Leave blank for none.
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
            (usernameCheck.valid ? (
              <p className="text-xs text-text-secondary mt-2">
                Your page:{" "}
                <span className="font-mono text-signal">
                  /c/{usernameCheck.username}
                </span>
              </p>
            ) : (
              <p className="text-xs text-ember mt-2">{usernameCheck.error}</p>
            ))}
        </section>

        {/* Saved URLs */}
        <section className="mt-6 rounded-2xl border border-border-strong bg-surface p-6 shadow-lifted">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Saved URLs
          </p>
          <p className="text-xs text-text-muted mt-1">
            Pick these at submit time instead of retyping. New URLs you submit are
            added here automatically.
          </p>

          <ul className="mt-4 space-y-2">
            {urls.length === 0 && loaded && (
              <li className="font-mono text-xs text-text-muted uppercase tracking-[0.12em] py-2">
                — no saved URLs yet
              </li>
            )}
            {urls.map((u) => (
              <li
                key={u}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-signal flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary truncate">
                    {domainOf(u)}
                  </span>
                  <span className="block font-mono text-[11px] text-text-muted truncate">
                    {u}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeUrl(u)}
                  className="flex-shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-ember transition-colors min-h-[36px] px-2"
                  aria-label={`Remove ${u}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {/* Add URL */}
          <div className="mt-4 flex gap-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="https://example.com"
              className={INPUT}
            />
            <button
              type="button"
              onClick={addUrl}
              className="flex-shrink-0 rounded-lg border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-text-primary hover:border-signal/50 transition-colors min-h-[44px]"
            >
              Add
            </button>
          </div>
        </section>

        {/* Save */}
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-signal text-void font-semibold rounded-full px-7 min-h-[48px] shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-50 inline-flex items-center gap-2"
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
