import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { tapLight } from "../lib/haptics";

interface Settings {
  displayName: string | null;
  username: string | null;
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const [settings, setSettings] = useState<Settings>({ displayName: null, username: null });
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAnonymous) { setLoading(false); return; }
    apiFetch("/api/settings")
      .then((r) => r.json())
      .then((d: Settings) => {
        setSettings(d);
        setDisplayName(d.displayName ?? "");
        setUsername(d.username ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, isAnonymous]);

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
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Could not save. Try again.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Could not save. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    displayName.trim() !== (settings.displayName ?? "") ||
    username.trim() !== (settings.username ?? "");

  if (!user || isAnonymous) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-8 text-center">
        <button onClick={() => navigate("/")} className="absolute left-6 top-14 font-mono text-xs uppercase tracking-widest text-text-muted">←</button>
        <p className="text-text-secondary">Sign in to edit your settings.</p>
        <button
          onClick={() => navigate("/signin")}
          className="min-h-[52px] w-full max-w-xs rounded-full bg-signal px-6 font-display text-base font-black uppercase tracking-tight text-void"
        >
          Sign In
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <header className="flex items-center gap-3 px-5 pb-3 pt-14">
        <button onClick={() => navigate(-1 as never)} className="font-mono text-xs uppercase tracking-widest text-text-muted">←</button>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-text-primary">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {loading ? (
          <div className="flex flex-col gap-3 pt-4">
            <div className="h-16 animate-pulse rounded-2xl bg-surface" />
            <div className="h-16 animate-pulse rounded-2xl bg-surface" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-3 rounded-2xl bg-surface px-4 py-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Display Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name on the leaderboard"
                  maxLength={60}
                  className="min-h-[44px] rounded-xl border border-border-strong bg-elevated px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Username</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm text-text-muted">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourhandle"
                    maxLength={30}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="min-h-[44px] flex-1 rounded-xl border border-border-strong bg-elevated px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none"
                  />
                </div>
              </label>
            </div>

            {error && <p className="text-sm text-ember">{error}</p>}

            <button
              onClick={save}
              disabled={saving || !dirty}
              className="min-h-[52px] rounded-full bg-signal px-6 font-display text-base font-black uppercase tracking-tight text-void transition-transform active:scale-95 disabled:opacity-40"
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
