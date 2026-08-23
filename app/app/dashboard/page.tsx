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
import { BlockCard } from "../../src/components/Dashboard/BlockCard";

const CATEGORY_ACCENTS: Record<string, string> = {
  tech: "#00d4ff",
  design: "#ff6b9d",
  business: "#ffd700",
  creative: "#9b59b6",
  gaming: "#00ff88",
  science: "#ff8c00",
  Tech: "#00d4ff",
  Design: "#ff6b9d",
  Business: "#ffd700",
  Creative: "#9b59b6",
  Gaming: "#00ff88",
  Science: "#ff8c00",
};

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
    <div className="bg-surface rounded-2xl border border-border-subtle p-6 animate-pulse">
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
        <div className="w-8 h-8 border-2 border-text-muted/30 border-t-accent-tech rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — redirect happening
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-void">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-3 bg-void/80 backdrop-blur border-b border-border-subtle">
        <Link
          href="/"
          className="text-xl font-semibold text-text-primary hover:text-accent-tech transition-colors"
        >
          Tower
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-muted hidden sm:block">
            Your blocks
          </span>
          <SignOutButton />
        </div>
      </nav>

      {/* Page heading */}
      <div className="px-4 py-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-text-primary">
          Your blocks across all towers
        </h1>
      </div>

      {/* Content */}
      <main className="px-4 pb-12 max-w-6xl mx-auto">
        {fetchState.status === "loading" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {fetchState.status === "error" && (
          <div
            role="alert"
            className="bg-surface border border-danger/30 rounded-2xl p-8 text-center"
          >
            <p className="text-text-muted mb-2">{fetchState.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-accent-tech hover:underline"
            >
              Refresh
            </button>
          </div>
        )}

        {fetchState.status === "success" && fetchState.data.blocks.length === 0 && (
          // AC-26: Empty state
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="text-border-subtle">
              <TowerIcon />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mt-4">
              No blocks yet
            </h2>
            <p className="text-sm text-text-muted mt-2 max-w-sm">
              You haven&apos;t claimed any blocks yet. Start by browsing a
              category.
            </p>
            <Link
              href="/tower/tech"
              className="mt-6 bg-surface border border-border-subtle rounded-lg px-6 py-3 text-sm text-text-primary hover:bg-elevated transition-colors min-h-[44px] inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Browse categories
            </Link>
          </div>
        )}

        {fetchState.status === "success" && fetchState.data.blocks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {fetchState.data.blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                categoryAccent={
                  CATEGORY_ACCENTS[block.category] ?? "#00d4ff"
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Separated sign-out button — uses useAuth inside a client component.
 * This avoids calling useAuth inside a conditional or callback in the parent.
 */
function SignOutButton() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      aria-label="Sign out"
      className="text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] inline-flex items-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
    >
      Sign out
    </button>
  );
}
