import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreatorPlatform } from "@prisma/client";
import { apiFetch, API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import { tapLight } from "../lib/haptics";
import { dailySummary } from "../lib/daily";
import { ScreenHeader, ScreenBody, Card, StatCard, Button } from "../components/ui";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { SocialMark } from "@app/components/Social/SocialMark";
import { PLATFORM_META } from "@app/lib/socialHandle";

interface FreeClimb {
  peakY: number;
  rank: number;
  totalClimbers: number;
  wins: number;
  handle: string;
}
interface DashboardData {
  user: { id: string; email: string; username: string | null };
  freeClimb: FreeClimb | null;
}
type SocialState = Partial<Record<CreatorPlatform, string>>;
interface SettingsData {
  displayName: string | null;
  username: string | null;
  social: SocialState | null;
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const streak = dailySummary().streak;

  useEffect(() => {
    if (!user || isAnonymous) {
      setLoading(false);
      return;
    }
    let alive = true;
    Promise.all([
      apiFetch("/api/dashboard").then((r) => r.json()).catch(() => null),
      apiFetch("/api/settings").then((r) => r.json()).catch(() => null),
    ])
      .then(([dash, set]) => {
        if (!alive) return;
        if (dash) setData(dash);
        if (set) setSettings(set);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user, isAnonymous]);

  const climb = data?.freeClimb ?? null;
  const displayName =
    settings?.displayName || climb?.handle || data?.user.email || "Player";
  const username = settings?.username ?? data?.user.username ?? null;
  const initial = displayName.charAt(0).toUpperCase();
  const socialEntries = settings?.social
    ? (Object.entries(settings.social) as [CreatorPlatform, string][]).filter(
        ([, v]) => v && v.trim(),
      )
    : [];
  const topPct =
    climb && climb.totalClimbers
      ? Math.max(1, Math.round((climb.rank / climb.totalClimbers) * 100))
      : null;

  return (
    <main className="flex h-[100dvh] flex-col">
      <ScreenHeader
        eyebrow="your climb"
        title="Profile"
        onBack={() => navigate("/")}
        trailing={
          <button
            aria-label="Settings"
            onClick={() => {
              void tapLight();
              navigate("/settings");
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border-subtle bg-surface/70 text-text-secondary transition-transform active:scale-90"
          >
            <GearIcon />
          </button>
        }
      />

      <ScreenBody>
        {loading ? (
          <div className="flex flex-col gap-3 pt-1">
            <div className="h-24 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
            <div className="h-40 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
            <div className="h-20 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            {/* Identity */}
            <Card>
              <div className="flex items-center gap-4">
                <span className="hm-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-3xl font-black text-void">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-black text-text-primary">
                    {displayName}
                  </p>
                  {username && (
                    <p className="truncate font-mono text-xs text-signal">
                      @{username}
                    </p>
                  )}
                  {data?.user.email && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-text-secondary">
                      {data.user.email}
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

            {/* Social chips */}
            {socialEntries.length > 0 && (
              <Card>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                  Socials
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {socialEntries.map(([platform, handle]) => (
                    <span
                      key={platform}
                      className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-elevated px-3 py-1.5 text-text-secondary"
                    >
                      <SocialMark platform={platform} className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono text-xs text-text-primary">
                        @{handle.replace(/^@/, "")}
                      </span>
                      <span className="sr-only">{PLATFORM_META[platform].label}</span>
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Actions */}
            {username && (
              <Button
                variant="secondary"
                onPress={() => {
                  void tapLight();
                  void openExternal(`${API_BASE}/c/${username}`);
                }}
              >
                View public page ↗
              </Button>
            )}
          </div>
        )}
      </ScreenBody>
    </main>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
