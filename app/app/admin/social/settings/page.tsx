"use client";

import { useEffect, useState } from "react";
import { useSocialApi } from "../../../../src/components/Social/useSocialApi";

interface Account {
  id: string;
  platform: string;
  handle: string;
  status: string;
}

interface BrandProfile {
  name: string;
  niche: string | null;
  audience: string | null;
  tone: string | null;
  topicsToDiscuss: string[];
  topicsToAvoid: string[];
}

interface AutomationSettings {
  approvalMode: string;
}

const PLATFORM_CONNECT: Record<string, string> = {
  TIKTOK: "/api/social/accounts/tiktok/connect",
  X: "/api/social/accounts/x/connect",
  YOUTUBE: "/api/social/accounts/youtube/connect",
};

export default function SettingsPage() {
  const { request, token } = useSocialApi();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      request<{ accounts: Account[] }>("/api/social/accounts"),
      request<BrandProfile | null>("/api/social/brand-profile"),
      request<AutomationSettings>("/api/social/settings"),
    ])
      .then(([acc, bp, st]) => {
        setAccounts(acc.accounts);
        setBrand(bp ?? { name: "", niche: null, audience: null, tone: null, topicsToDiscuss: [], topicsToAvoid: [] });
        setSettings(st);
      })
      .catch((err) => setError(err.message));
  }, [request]);

  async function connect(platform: string) {
    try {
      const data = await request<{ authorizeUrl: string }>(PLATFORM_CONNECT[platform], {
        method: "POST",
        body: JSON.stringify({ redirectAfter: "/admin/social/settings" }),
      });
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function disconnect(id: string) {
    try {
      await request(`/api/social/accounts/${id}/disconnect`, { method: "POST", body: "{}" });
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "DISCONNECTED" } : a)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!brand) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await request<BrandProfile>("/api/social/brand-profile", {
        method: "PUT",
        body: JSON.stringify(brand),
      });
      setBrand(saved);
      setMessage("Brand profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(approvalMode: string) {
    try {
      const saved = await request<AutomationSettings>("/api/social/settings", {
        method: "PUT",
        body: JSON.stringify({ approvalMode }),
      });
      setSettings(saved);
      setMessage("Automation settings saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!token) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Settings</h1>
        <p className="text-text-muted text-sm mt-1">Connect accounts, brand profile, and approval mode.</p>
      </header>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      <section className="rounded-xl border border-border bg-elevated p-5 space-y-4">
        <h2 className="font-semibold text-sm">Social accounts</h2>
        <div className="flex flex-wrap gap-2">
          {(["TIKTOK", "X", "YOUTUBE"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => connect(p)}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-mono hover:border-signal hover:text-signal transition-colors"
            >
              Connect {p}
            </button>
          ))}
        </div>
        <ul className="space-y-2 text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between">
              <span>
                <span className="font-mono text-xs text-text-muted mr-2">{a.platform}</span>
                {a.handle} <span className="text-text-muted">({a.status})</span>
              </span>
              {a.status !== "DISCONNECTED" && (
                <button type="button" onClick={() => disconnect(a.id)} className="text-xs text-red-400 hover:underline">
                  Disconnect
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {brand && (
        <form onSubmit={saveBrand} className="rounded-xl border border-border bg-elevated p-5 space-y-4">
          <h2 className="font-semibold text-sm">Brand profile</h2>
          <Field label="Name" value={brand.name} onChange={(v) => setBrand({ ...brand, name: v })} required />
          <Field label="Niche" value={brand.niche ?? ""} onChange={(v) => setBrand({ ...brand, niche: v })} />
          <Field label="Audience" value={brand.audience ?? ""} onChange={(v) => setBrand({ ...brand, audience: v })} />
          <Field label="Tone" value={brand.tone ?? ""} onChange={(v) => setBrand({ ...brand, tone: v })} />
          <Field
            label="Topics to discuss (comma-separated)"
            value={brand.topicsToDiscuss.join(", ")}
            onChange={(v) => setBrand({ ...brand, topicsToDiscuss: v.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
          <Field
            label="Topics to avoid (comma-separated)"
            value={brand.topicsToAvoid.join(", ")}
            onChange={(v) => setBrand({ ...brand, topicsToAvoid: v.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
          <button type="submit" disabled={saving} className="rounded-full bg-signal px-5 py-2 text-sm font-semibold text-void disabled:opacity-50">
            {saving ? "Saving…" : "Save brand profile"}
          </button>
        </form>
      )}

      {settings && (
        <section className="rounded-xl border border-border bg-elevated p-5 space-y-3">
          <h2 className="font-semibold text-sm">Approval mode</h2>
          <p className="text-text-muted text-xs">Current: <span className="font-mono">{settings.approvalMode}</span></p>
          <div className="flex flex-wrap gap-2">
            {(["ALWAYS_REQUIRE_APPROVAL", "MANUAL_ONLY", "AUTO_PUBLISH_TRUSTED"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => saveSettings(mode)}
                className={`rounded-full px-3 py-1 text-xs font-mono border ${
                  settings.approvalMode === mode ? "border-signal text-signal" : "border-border text-text-muted"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-border bg-void px-3 py-2 text-sm focus:outline-none focus:border-border-focus"
      />
    </div>
  );
}
