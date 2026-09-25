import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import { openExternal } from "../lib/external";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard, useInvalidateAppData, useSettings } from "../contexts/AppDataContext";
import { tapLight, tapHeavy } from "../lib/haptics";
import { dailySummary, formatReset, msUntilReset } from "../lib/daily";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { HexAvatar } from "../components/HexAvatar";
import { HubHeader } from "../components/HubHeader";
import { avatarButtonLabel, identityNameFor } from "../lib/identity";

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
  const identityName = identityNameFor(settingsData, dashData, user?.uid);
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
        <HubHeader title="Profile" subtitle={["Your climb"]} />

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
            <section className="glass flex flex-wrap items-center gap-3.5 rounded-3xl border border-white/10 p-4">
              <button
                type="button"
                aria-label={avatarButtonLabel(settingsData?.avatarId ?? null)}
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
              {/* min-w in rem: at a large text size on a narrow phone the name and
                  the pencil wrap under the avatar instead of squeezing the name. */}
              <div className="min-w-[6.5rem] flex-1">
                {/* Wraps instead of ellipsizing. Beside the avatar and the pencil, an
                    ellipsis cuts a pseudonym at its animal word at 320px, which is the
                    word the avatar changes. No clamp, so a large text size never cuts
                    it. Balanced wrapping breaks at a space. A single
                    over-long word breaks as a last resort. */}
                <p className="break-words text-balance font-display text-name font-black text-text-primary">
                  {identityName}
                </p>
                {identityUsername && (
                  <p className="truncate font-mono text-meta text-signal">@{identityUsername}</p>
                )}
                {dashData?.user.email && (
                  // Wraps rather than ellipsizes; the <wbr> puts the first break after the "@".
                  <p className="mt-0.5 line-clamp-2 break-words font-mono text-meta text-text-secondary">
                    <EmailText email={dashData.user.email} />
                  </p>
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
              // Below ~380px the text column beside the crown and Try again is
              // a word wide, so Try again wraps onto its own full-width row.
              <section
                className="glass flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl border border-white/10 px-5 py-4"
                aria-label="Best climb"
              >
                <CrownIcon muted />
                <span className="h-12 w-px shrink-0 bg-white/15" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-body font-black uppercase tracking-tight text-text-primary">
                    Couldn&apos;t load your climb
                  </p>
                  <p className="mt-0.5 text-meta text-text-secondary">Check your connection</p>
                </div>
                <button
                  type="button"
                  onClick={retryDashboard}
                  className="min-h-[44px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-meta font-semibold text-text-primary transition-transform active:scale-95 max-[379px]:w-full"
                >
                  Try again
                </button>
              </section>
            ) : climb ? (
              <section className="glow-card flex items-center gap-4 rounded-3xl px-5 py-4" aria-label="Best climb">
                <CrownIcon />
                <span className="h-14 w-px shrink-0 bg-signal/30" />
                <div className="min-w-0 flex-1 text-center">
                  <p className="font-mono text-label font-bold uppercase tracking-label text-text-secondary">
                    Best climb
                  </p>
                  <p className="mt-1 font-display text-hero font-black tabular-nums text-signal">
                    {climb.peakY.toLocaleString()}
                    <span className="ml-1 text-[0.5em] font-bold text-text-secondary">{ALTITUDE_UNIT}</span>
                  </p>
                  <p className="mt-2 font-mono text-label uppercase tracking-label text-text-secondary">
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
                  <p className="font-display text-lead font-black uppercase tracking-tight text-text-primary">
                    No climbs yet
                  </p>
                  <p className="mt-0.5 text-meta text-text-secondary">Hit Play to set your first record</p>
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
              className="cta-lime flex min-h-[56px] w-full items-center justify-center gap-3 rounded-[22px] py-2 text-void transition-transform active:scale-[0.97]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141612] text-signal">
                <PlayGlyph />
              </span>
              <span className="font-display text-cta font-black uppercase tracking-[-0.01em]">Daily climb</span>
            </button>

            {identityUsername && (
              <button
                onClick={() => {
                  void tapLight();
                  void openExternal(`${API_BASE}/c/${identityUsername}`);
                }}
                className="glass flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border border-white/10 font-display text-meta font-bold uppercase tracking-label text-text-primary transition-transform active:scale-[0.98]"
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
              <span className="flex-1 text-body font-medium text-text-primary">Edit profile &amp; socials</span>
              <ChevronRight />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function EmailText({ email }: { email: string }) {
  const at = email.indexOf("@");
  if (at < 0) return <>{email}</>;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass flex flex-col items-center rounded-3xl border border-white/10 px-3 py-4">
      <span
        className={`font-display text-stat font-black tabular-nums ${accent ? "text-signal" : "text-text-primary"}`}
      >
        {value}
      </span>
      <span className="mt-2 font-mono text-label font-bold uppercase tracking-label text-text-secondary">
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
        <p className="mt-0.5 text-meta leading-snug text-text-secondary">{detail}</p>
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
