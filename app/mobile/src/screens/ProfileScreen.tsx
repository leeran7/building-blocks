import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard, useInvalidateAppData, useSettings } from "../contexts/AppDataContext";
import { tapLight, tapHeavy } from "../lib/haptics";
import { dailySummary, formatReset, msUntilReset } from "../lib/daily";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { HexAvatar } from "../components/HexAvatar";
import { identityNameFor } from "../lib/identity";

/**
 * Profile — the player's identity and standing, plus the daily-climb hook.
 * Editing (name, socials, preferences, account actions) lives on the pushed
 * Edit Profile screen so this page reads as a game card, not a form.
 */
export function ProfileScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dash = useDashboard();
  const settingsSlice = useSettings();
  const invalidate = useInvalidateAppData();

  const dashData = dash.data;
  const settingsData = settingsSlice.data;
  const daily = dailySummary();

  const climb = dashData?.freeClimb ?? null;
  const identityName = identityNameFor(settingsData, dashData);
  const identityUsername = settingsData?.username ?? dashData?.user.username ?? null;
  const topPct =
    climb && climb.totalClimbers
      ? Math.max(1, Math.round((climb.rank / climb.totalClimbers) * 100))
      : null;

  // Cold-load skeleton only; warm revisits render straight from cache.
  const loading = (dash.loading && !dashData) || (settingsSlice.loading && !settingsData);
  // A failed dashboard load is not "no climbs yet": say so and offer a retry.
  const dashFailed = dash.error && !dashData;

  const retryDashboard = () => {
    void tapLight();
    // Marking the slice stale makes useDashboard refetch now, not after the TTL.
    invalidate(["dashboard"]);
  };

  const openEdit = () => {
    void tapLight();
    navigate("/profile/edit");
  };

  const openAvatarPicker = () => {
    void tapLight();
    navigate("/profile/avatar");
  };

  return (
    <main className="flex h-full flex-col">
      <div
        className="flex-1 overflow-y-auto px-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        <header className="pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <p className="font-display text-xl font-black uppercase leading-none tracking-[-0.02em] text-text-primary">
            Doom<span className="text-signal">stack</span>
          </p>
          <h1 className="metal-title mt-1 font-display text-[2.6rem] font-black uppercase leading-none tracking-[-0.02em]">
            Profile
          </h1>
        </header>

        {loading ? (
          <div className="flex flex-col gap-3" aria-label="Loading profile">
            <div className="h-24 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
            <div className="h-32 animate-pulse rounded-3xl border border-signal/20 bg-surface/60" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-24 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
              <div className="h-24 animate-pulse rounded-3xl border border-white/10 bg-surface/60" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-6">
            <section className="glass flex items-center gap-3.5 rounded-3xl border border-white/10 p-4">
              <button
                type="button"
                aria-label="Change avatar"
                onClick={openAvatarPicker}
                className="relative shrink-0 rounded-2xl transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
              >
                <HexAvatar
                  userId={user?.uid ?? identityName}
                  name={identityName}
                  avatarId={settingsData?.avatarId ?? null}
                  size={64}
                />
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-void bg-signal text-void"
                >
                  <BadgePencilIcon />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-display font-black leading-tight text-text-primary"
                  style={{ fontSize: "clamp(1.05rem, calc(4.4vw + 0.25rem), 1.35rem)" }}
                >
                  {identityName}
                </p>
                {identityUsername && (
                  <p className="truncate font-mono text-sm text-signal">@{identityUsername}</p>
                )}
                {dashData?.user.email && (
                  <p className="mt-0.5 truncate font-mono text-xs text-text-secondary">{dashData.user.email}</p>
                )}
              </div>
              <button
                aria-label="Edit profile"
                onClick={openEdit}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-text-primary transition-transform active:scale-90"
              >
                <PencilIcon />
              </button>
            </section>

            {dashFailed ? (
              <section className="glass flex items-center gap-4 rounded-3xl border border-white/10 px-5 py-4" aria-label="Best climb">
                <CrownIcon muted />
                <span className="h-12 w-px shrink-0 bg-white/15" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-black uppercase tracking-tight text-text-primary">
                    Couldn&apos;t load your climb
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-secondary">Check your connection</p>
                </div>
                <button
                  type="button"
                  onClick={retryDashboard}
                  className="min-h-[44px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-text-primary transition-transform active:scale-95"
                >
                  Try again
                </button>
              </section>
            ) : climb ? (
              <section className="glow-card flex items-center gap-4 rounded-3xl px-5 py-4" aria-label="Best climb">
                <CrownIcon />
                <span className="h-14 w-px shrink-0 bg-signal/30" />
                <div className="min-w-0 flex-1 text-center">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-text-secondary">
                    Best climb
                  </p>
                  <p
                    className="mt-1 font-display font-black leading-none tabular-nums text-signal"
                    style={{ fontSize: "clamp(1.9rem, 10vw, 2.6rem)" }}
                  >
                    {climb.peakY.toLocaleString()}
                    <span className="ml-1 text-[0.5em] font-bold text-text-secondary">{ALTITUDE_UNIT}</span>
                  </p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                    #{climb.rank.toLocaleString()}
                    {climb.totalClimbers ? ` of ${climb.totalClimbers.toLocaleString()}` : ""}
                    {topPct ? ` · top ${topPct}%` : ""}
                  </p>
                </div>
              </section>
            ) : (
              <section className="glass flex items-center gap-4 rounded-3xl border border-white/10 px-5 py-4">
                <CrownIcon muted />
                <span className="h-12 w-px shrink-0 bg-white/15" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-black uppercase tracking-tight text-text-primary">
                    No climbs yet
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-secondary">Hit Play to set your first record</p>
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Wins" value={dashFailed ? "—" : String(climb?.wins ?? 0)} />
              <StatTile
                label="Daily streak"
                value={daily.streak > 0 ? String(daily.streak) : "—"}
                accent={daily.streak > 0}
              />
            </div>

            <StreakCard streak={daily.streak} playedToday={daily.playedToday} />

            <button
              onClick={() => {
                void tapHeavy();
                navigate("/climb?daily=1");
              }}
              className="cta-lime flex min-h-[64px] w-full items-center justify-center gap-3 rounded-[22px] text-void transition-transform active:scale-[0.97]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141612] text-signal">
                <PlayGlyph />
              </span>
              <span className="font-display text-[1.6rem] font-black uppercase tracking-[-0.01em]">Daily climb</span>
            </button>

            {identityUsername && (
              <button
                onClick={() => {
                  void tapLight();
                  void openExternal(`${API_BASE}/c/${identityUsername}`);
                }}
                className="glass flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border border-white/10 font-display text-sm font-bold uppercase tracking-[0.14em] text-text-primary transition-transform active:scale-[0.98]"
              >
                <ExternalIcon />
                View public page
              </button>
            )}

            <button
              onClick={openEdit}
              className="glass flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-white/10 px-4 text-left transition-transform active:scale-[0.98]"
            >
              <PencilIcon />
              <span className="flex-1 text-[15px] font-medium text-text-primary">Edit profile &amp; socials</span>
              <ChevronRight />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass flex flex-col items-center rounded-3xl border border-white/10 px-3 py-4">
      <span
        className={`font-display text-[2rem] font-black leading-none tabular-nums ${accent ? "text-signal" : "text-text-primary"}`}
      >
        {value}
      </span>
      <span className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-text-secondary">
        {label}
      </span>
    </div>
  );
}

/** Where the player stands on today's daily — status only; the button below plays it. */
function StreakCard({ streak, playedToday }: { streak: number; playedToday: boolean }) {
  const reset = formatReset(msUntilReset());
  const [title, detail] =
    streak === 0
      ? ["Start your streak", "Complete a daily climb"]
      : playedToday
        ? [`${streak}-day streak`, `Done for today · new map in ${reset}`]
        : [`Keep your ${streak}-day streak`, `Play today's climb · resets in ${reset}`];
  return (
    <section className="glass flex items-center gap-3.5 rounded-3xl border border-white/10 px-4 py-3.5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-ember/60 bg-ember/15">
        <FlameIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-black uppercase tracking-wide text-text-primary">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-text-secondary">{detail}</p>
      </div>
    </section>
  );
}

function CrownIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      width="40"
      height="34"
      viewBox="0 0 24 22"
      fill="currentColor"
      className={`shrink-0 ${muted ? "text-text-muted" : "text-signal drop-shadow-[0_0_8px_rgba(203,242,77,0.5)]"}`}
      aria-hidden
    >
      <path d="M2 6 7 10 12 3 17 10 22 6 20 17H4L2 6Z" />
      <rect x="4" y="18.5" width="16" height="2.5" rx="1" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-ember" aria-hidden>
      <path d="M12 2c.5 3-1.5 4.5-3 6.5C7.4 10.6 6.5 12.3 6.5 14a5.5 5.5 0 0 0 11 0c0-1.7-.8-3.2-2-4.5-.6 1-1.6 1.6-2.6 1.6 1-2 .3-4.4-1.4-6.1C11.6 5 12 3.4 12 2Z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-primary" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function BadgePencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
