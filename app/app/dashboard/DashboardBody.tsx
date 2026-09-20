"use client";

/**
 * DashboardBody — the client half of /dashboard.
 *
 * "Duels | Climb" tab shell matching the /climb design language. The payload is
 * resolved server-side in page.tsx and handed down as `initialData` so the page
 * paints real content on first frame.
 *
 * The client fetch is *not* suppressed when `initialData` is present: it runs
 * once per mount as a silent background revalidation (see the effect below for
 * why). With data already seeded it can only ever replace correct-looking
 * content with newer content — never with a skeleton, spinner, or error.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../src/contexts/AuthContext";
import { Navbar } from "../../src/components/Navbar";
import { CreatorPageBand } from "../../src/components/Dashboard/CreatorPageBand";
import { FreeClimbCard, FreeClimbEmpty } from "../../src/components/Dashboard/FreeClimbCard";
import { ClimbReplaysSection } from "../../src/components/Dashboard/ClimbReplaysSection";
import { DuelRecordCard, DuelRecordEmpty } from "../../src/components/Dashboard/DuelRecordCard";
import { DuelReplaysSection } from "../../src/components/Dashboard/DuelReplaysSection";
import type { DashboardData } from "../../src/db/dashboard";
import { WalletCard } from "../../src/components/Dashboard/WalletCard";
import { BetaBanner } from "../../src/components/BetaBanner";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../src/config/paidDuel";

type Tab = "duels" | "climb";

/**
 * Shape of GET /api/dashboard and of the server-resolved `initialData` prop —
 * one definition, owned by the builder both producers call.
 */
export type { DashboardData } from "../../src/db/dashboard";

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: DashboardData };

const SIGNIN_REDIRECT = "/auth/signin?redirect=%2Fdashboard";

/**
 * Failure handling for the fetch: surface the error only when the user has no
 * content yet. A failed *background* revalidation must leave the already
 * painted dashboard alone rather than replace it with an error card.
 */
function errorUnlessAlreadyLoaded(message: string) {
  return (prev: FetchState): FetchState =>
    prev.status === "success" ? prev : { status: "error", message };
}

interface Props {
  /** Server-resolved payload, or null when the request-time cookie check failed. */
  initialData: DashboardData | null;
}

export function DashboardBody({ initialData }: Props) {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();
  const [fetchState, setFetchState] = useState<FetchState>(
    initialData !== null
      ? { status: "success", data: initialData }
      : { status: "loading" }
  );
  const [tab, setTab] = useState<Tab>("duels");

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push(SIGNIN_REDIRECT);
        return;
      }
      if (!res.ok) {
        setFetchState(errorUnlessAlreadyLoaded("Failed to load. Please refresh."));
        return;
      }
      const data: DashboardData = await res.json();
      setFetchState({ status: "success", data });
    } catch {
      setFetchState(errorUnlessAlreadyLoaded("Network error. Please refresh."));
    }
  }, [token, router]);

  // Auth gate — independent of the server cookie check. The firebaseToken
  // cookie can be stale or absent while the Firebase client SDK still holds a
  // valid session (and vice versa), so this stays client-authoritative.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) router.push(SIGNIN_REDIRECT);
  }, [authLoading, user, token, router]);

  // Background revalidation — runs on every mount, whether or not the server
  // pre-populated `initialData`. It must NOT be suppressed when initialData is
  // present: Next.js's back/forward (history traversal) navigation restores a
  // cached RSC segment — including an `initialData` resolved before the user
  // left the page — with no fresh server request, and deliberately ignores
  // staleTimes.dynamic while doing it. Without this fetch, returning to
  // /dashboard via Back after winning a duel would show the pre-duel record
  // forever. Re-fetching on mount is exactly what the pre-server-render
  // version did; the difference is only that the first paint is already
  // correct, so this fetch is silent (no skeleton in flight, and a failure
  // keeps the painted content — see errorUnlessAlreadyLoaded).
  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) return;
    fetchDashboard();
  }, [authLoading, user, token, fetchDashboard]);

  // Loading chrome only matters without server data; with it we paint content.
  if (initialData === null) {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-void flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
        </div>
      );
    }
    if (!user) return null;
  }

  return (
    <main id="main-content" className="grain topo min-h-screen bg-void flex flex-col">
      <Navbar contextLabel="Dashboard" />

      {/* Tab band */}
      <div className="border-b border-border-subtle shrink-0">
        <div className="max-w-2xl mx-auto w-full px-4 py-2 flex items-center justify-between gap-4">
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="Dashboard sections"
          >
            <DashTab label="Duels" active={tab === "duels"} onClick={() => setTab("duels")} />
            <DashTab label="Climb" active={tab === "climb"} onClick={() => setTab("climb")} />
          </div>
          <Link
            href="/duel"
            className="inline-flex items-center justify-center rounded-full px-5 min-h-[40px] bg-signal text-void text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            Start a duel
          </Link>
        </div>
      </div>

      {/* Always-visible secondary entry point — narrow viewports don't get
          the Navbar's "1v1" link (hidden below `sm`), so this closes that
          discoverability gap without competing with "Start a duel" above. */}
      <div className="max-w-2xl mx-auto w-full px-4 pt-3">
        <Link
          href="/duel?mode=challenge"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-secondary hover:text-signal transition-colors"
        >
          Challenge a friend →
        </Link>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-5">
        {fetchState.status === "loading" && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {fetchState.status === "error" && (
          <div role="alert" className="bg-surface border border-ember/30 rounded-xl p-8 text-center">
            <p className="text-text-secondary text-sm mb-3">{fetchState.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="font-mono text-xs uppercase tracking-[0.12em] text-signal hover:brightness-110 transition"
            >
              Refresh
            </button>
          </div>
        )}

        {fetchState.status === "success" && (
          <>
            {/* Beta banner / badge — both branches are decided by server-known
                `betaJoined`, never by the client-only `token`, so neither pops
                in late and shifts the cards below it. The banner's Join action
                still needs a token; it disables that one button until the
                Firebase session resolves. */}
            {fetchState.data.user.betaJoined ? (
              <div className="flex items-center gap-2 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" aria-hidden="true" />
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">
                  Signed up for beta
                </p>
              </div>
            ) : (
              <BetaBanner token={token} />
            )}

            {/* ── Duels tab ─────────────────────────────── */}
            {tab === "duels" && (
              <>
                {PAID_DUELS_ENABLED_PUBLIC && <WalletCard token={token} />}

                {fetchState.data.duelStats ? (
                  <DuelRecordCard record={fetchState.data.duelStats} />
                ) : (
                  <DuelRecordEmpty />
                )}

                {(fetchState.data.recentDuels?.length ?? 0) > 0 && (
                  <DuelReplaysSection
                    duels={fetchState.data.recentDuels!}
                    userId={fetchState.data.user.id}
                  />
                )}
              </>
            )}

            {/* ── Climb tab ─────────────────────────────── */}
            {tab === "climb" && (
              <>
                {fetchState.data.freeClimb ? (
                  <FreeClimbCard climb={fetchState.data.freeClimb} />
                ) : (
                  <FreeClimbEmpty />
                )}

                <ClimbReplaysSection replays={fetchState.data.replays ?? []} />
              </>
            )}

            {/* ── Below-fold: creator page band ── */}
            <div className="mt-2">
              <CreatorPageBand username={fetchState.data.user.username} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function DashTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-[color,filter] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (active
          ? "bg-signal text-void hover:brightness-110"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-border-subtle p-5 animate-pulse">
      <div className="h-3 w-20 bg-border-subtle rounded-sm mb-4" />
      <div className="h-6 w-40 bg-border-subtle rounded-sm mb-2" />
      <div className="h-4 w-28 bg-border-subtle rounded-sm" />
    </div>
  );
}
