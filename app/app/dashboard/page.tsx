"use client";

/**
 * Dashboard — /dashboard
 *
 * "Duels | Climb" tab shell matching the /climb design language.
 * Same data fetch as before; tabs split the content client-side.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../src/contexts/AuthContext";
import { Navbar } from "../../src/components/Navbar";
import { CreatorPageBand } from "../../src/components/Dashboard/CreatorPageBand";
import {
  FreeClimbCard,
  FreeClimbEmpty,
  type FreeClimbData,
} from "../../src/components/Dashboard/FreeClimbCard";
import {
  ClimbReplaysSection,
  type ClimbReplayItem,
} from "../../src/components/Dashboard/ClimbReplaysSection";
import {
  DuelRecordCard,
  DuelRecordEmpty,
  type DuelRecordData,
} from "../../src/components/Dashboard/DuelRecordCard";
import {
  DuelReplaysSection,
  type DuelReplayItem,
} from "../../src/components/Dashboard/DuelReplaysSection";
import { WalletCard } from "../../src/components/Dashboard/WalletCard";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../src/config/paidDuel";

type Tab = "duels" | "climb";

interface DashboardData {
  user: { id: string; email: string; username: string | null };
  freeClimb: FreeClimbData | null;
  replays: ClimbReplayItem[];
  duelStats: DuelRecordData | null;
  recentDuels?: DuelReplayItem[];
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: DashboardData };

export default function DashboardPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("duels");

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push("/auth/signin?redirect=%2Fdashboard");
        return;
      }
      if (!res.ok) {
        setFetchState({ status: "error", message: "Failed to load. Please refresh." });
        return;
      }
      const data: DashboardData = await res.json();
      setFetchState({ status: "success", data });
    } catch {
      setFetchState({ status: "error", message: "Network error. Please refresh." });
    }
  }, [token, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      router.push("/auth/signin?redirect=%2Fdashboard");
      return;
    }
    fetchDashboard();
  }, [authLoading, user, token, router, fetchDashboard]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

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
            className="inline-flex items-center justify-center rounded-full px-5 min-h-[40px] bg-signal text-void text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            Start a duel
          </Link>
        </div>
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
        "inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-[color,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
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
      <div className="h-3 w-20 bg-border-subtle rounded mb-4" />
      <div className="h-6 w-40 bg-border-subtle rounded mb-2" />
      <div className="h-4 w-28 bg-border-subtle rounded" />
    </div>
  );
}
