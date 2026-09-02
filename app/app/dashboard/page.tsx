"use client";

/**
 * Dashboard page — /dashboard
 *
 * Design spec: design.md §7.7
 * AC-17: Unauthenticated → redirect to /auth/signin?redirect=%2Fdashboard
 * AC-18: Shows each owned block with category, rank, altitude, views
 * AC-19: Recharts LineChart per block
 * AC-26: Empty state with CTA to browse categories
 *
 * Client component — needs useAuth() for token-gated fetch.
 * Middleware handles the redirect for unauthenticated users.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../src/contexts/AuthContext";
import { Navbar } from "../../src/components/Navbar";
import { BlockCard } from "../../src/components/Dashboard/BlockCard";
import {
  FreeClimbCard,
  FreeClimbEmpty,
  type FreeClimbData,
} from "../../src/components/Dashboard/FreeClimbCard";
import {
  ClimbReplaysSection,
  type ClimbReplayItem,
} from "../../src/components/Dashboard/ClimbReplaysSection";
import { formatAltitude } from "../../src/lib/units";

interface Payment {
  id: string;
  amount_cents: number;
  metres_added: number;
  created_at: string;
}

interface Season {
  id: string;
  views_k: number;
  category: string;
}

interface DashboardBlock {
  id: string;
  slug: string;
  display_name: string;
  url: string;
  category: string;
  altitude: number;
  rank: number;
  rank_above_altitude: number | null;
  views_served: number;
  spend_c: number;
  buried: boolean;
  amber_edge: boolean;
  burial_risk_days: number | null;
  competitor_cost_usd: number | null;
  season: Season;
  payments: Payment[];
}

interface DashboardData {
  user: { id: string; email: string };
  blocks: DashboardBlock[];
  freeClimb: FreeClimbData | null;
  replays: ClimbReplayItem[];
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: DashboardData };

function TowerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="14" rx="1" />
      <path d="M10 22v-6a2 2 0 0 1 4 0v6" />
      <path d="M6 8V6a6 6 0 0 1 12 0v2" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-border-subtle p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-6 w-20 bg-border-subtle rounded-full" />
        <div className="h-8 w-16 bg-border-subtle rounded-lg" />
      </div>
      <div className="h-6 w-48 bg-border-subtle rounded mt-3" />
      <div className="h-4 w-24 bg-border-subtle rounded mt-2" />
      <div className="h-8 w-32 bg-border-subtle rounded mt-2 mb-3" />
      <div className="h-[120px] bg-border-subtle rounded" />
      <div className="border-t border-border-subtle my-4" />
      <div className="h-4 w-16 bg-border-subtle rounded mb-2" />
      <div className="h-2 w-full bg-border-subtle rounded" />
      <div className="border-t border-border-subtle my-4" />
      <div className="h-16 bg-border-subtle rounded-lg" />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    // Wait for auth to resolve
    if (authLoading) return;

    // AC-17: Redirect unauthenticated users
    if (!user || !token) {
      router.push("/auth/signin?redirect=%2Fdashboard");
      return;
    }

    // Fetch dashboard data with Bearer token
    const fetchDashboard = async () => {
      try {
        const res = await fetch("/api/dashboard", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401) {
          router.push("/auth/signin?redirect=%2Fdashboard");
          return;
        }

        if (!res.ok) {
          setFetchState({
            status: "error",
            message: "Failed to load dashboard. Please try refreshing.",
          });
          return;
        }

        const data: DashboardData = await res.json();
        setFetchState({ status: "success", data });
      } catch {
        setFetchState({
          status: "error",
          message: "Network error. Please check your connection and refresh.",
        });
      }
    };

    fetchDashboard();
  }, [authLoading, user, token, router]);

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — redirect happening
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-void">
      {/* Shared, auth-aware nav with a "Dashboard" breadcrumb — consistent with
          the rest of the app (submit, settings, rules, stack/climb/play). */}
      <Navbar contextLabel="Dashboard" />

      {/* Page heading — context → heading → supporting → action */}
      <div className="px-4 md:px-6 pt-8 pb-6 max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-text-muted">
            Your account
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mt-1">
            Dashboard
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Your paid blocks, free climb rank, and saved replays.
          </p>
        </div>
        <Link
          href="/submit"
          className="flex-shrink-0 bg-signal text-void font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 transition min-h-[44px] inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Submit a block
        </Link>
      </div>

      {/* Content */}
      <main className="px-4 md:px-6 pb-16 max-w-7xl mx-auto">
        {fetchState.status === "loading" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {fetchState.status === "error" && (
          <div
            role="alert"
            className="bg-surface border border-danger/30 rounded-2xl p-8 text-center"
          >
            <p className="text-text-secondary mb-2">{fetchState.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-signal hover:underline"
            >
              Refresh
            </button>
          </div>
        )}

        {fetchState.status === "success" && (
          <>
            {fetchState.data.freeClimb ? (
              <FreeClimbCard climb={fetchState.data.freeClimb} />
            ) : (
              <FreeClimbEmpty />
            )}

            <ClimbReplaysSection replays={fetchState.data.replays ?? []} />

            {fetchState.data.blocks.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
                <div className="text-border-subtle">
                  <TowerIcon />
                </div>
                <h2 className="text-xl font-semibold text-text-primary mt-4">
                  No paid blocks yet
                </h2>
                <p className="text-sm text-text-secondary mt-2 max-w-sm">
                  You haven&apos;t claimed any paid stack blocks. Browse a category
                  to buy altitude, or keep climbing on the free leaderboard above.
                </p>
                <Link
                  href="/#towers"
                  className="mt-6 bg-surface border border-border-subtle rounded-lg px-6 py-3 text-sm text-text-primary hover:bg-elevated transition-colors min-h-[44px] inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Browse paid stacks
                </Link>
              </div>
            )}

            {fetchState.data.blocks.length > 0 && (
              <>
                <DashboardStats blocks={fetchState.data.blocks} />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {fetchState.data.blocks.map((block) => (
                    <BlockCard key={block.id} block={block} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * DashboardStats — overview band (Tailwind UI "Stats" pattern), derived from the
 * owner's real blocks. Above-ground count, best rank, total altitude, total spend.
 */
function DashboardStats({ blocks }: { blocks: DashboardBlock[] }) {
  const aboveGround = blocks.filter((b) => !b.buried).length;
  const bestRank = blocks.reduce(
    (min, b) => (b.rank < min ? b.rank : min),
    Infinity
  );
  const totalAltitude = blocks.reduce((sum, b) => sum + b.altitude, 0);
  const totalSpend = blocks.reduce((sum, b) => sum + b.spend_c, 0) / 100;

  const stats = [
    { label: "Blocks owned", value: String(blocks.length) },
    { label: "Above ground", value: `${aboveGround}/${blocks.length}` },
    {
      label: "Best rank",
      value: Number.isFinite(bestRank) ? `#${bestRank}` : "—",
    },
    { label: "Total altitude", value: formatAltitude(totalAltitude, 0) },
    { label: "Total invested", value: `$${totalSpend.toFixed(0)}` },
  ];

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-surface border border-border-subtle rounded-2xl shadow-card px-5 py-4"
        >
          <dt className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
            {s.label}
          </dt>
          <dd className="font-mono text-2xl font-bold text-text-primary tabular-nums mt-1">
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

