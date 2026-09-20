"use client";

/**
 * ClimbBoard — the /climb standings surface (ASCENT design).
 *
 * Composition (mockup 2): board scope row → [ search + find-me filter row +
 * ranked table ] beside a "your best" panel that carries the page's single
 * primary CTA. Below `lg` the panel stacks above the board, because "where do
 * I stand" is the first thing a returning climber wants.
 *
 * The standings themselves stay server-rendered and are passed in untouched —
 * this island exists only because Firebase identity is client-side. It reads
 * the EXISTING `GET /api/dashboard` (the same payload /dashboard already
 * fetches); every failure degrades to the CTA-only panel and never touches the
 * table.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import type { ClimberRank } from "../../db/climb";
import { ALTITUDE_UNIT } from "../../lib/units";
import { DUEL_LEADERBOARD_HREF, SIGNIN_HREF } from "../navLinks";
import { ClimbLeaderboard, YOUR_ROW_ID } from "./ClimbLeaderboard";
import { PlayTheClimbCta } from "./ClimbPanelIntro";

/** The slice of GET /api/dashboard this surface needs. Everything else is ignored. */
interface ViewerRecord {
  userId: string;
  peakY: number;
  rank: number;
  totalClimbers: number;
}

type ViewerState =
  | { status: "anonymous" }
  | { status: "loading" }
  /** Signed in, request settled, but this climber has no recorded run. */
  | { status: "none" }
  | { status: "ready"; record: ViewerRecord }
  /** Signed in but the read failed — panel falls back to the CTA only. */
  | { status: "unavailable" };

export function ClimbBoard({
  climbers,
  unavailable = false,
}: {
  climbers: ClimberRank[];
  unavailable?: boolean;
}) {
  const { user, token, loading: authLoading } = useAuth();
  const [viewer, setViewer] = useState<ViewerState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);

  // Identity-derived read: early-return while auth is still resolving and keep
  // `authLoading` in deps, per context/conventions.md.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      setViewer({ status: "anonymous" });
      return;
    }

    let cancelled = false;
    setViewer({ status: "loading" });

    authedFetch("/api/dashboard", token)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          user?: { id?: string };
          freeClimb?: {
            peakY?: number;
            rank?: number;
            totalClimbers?: number;
          } | null;
        };
      })
      .then((body) => {
        if (cancelled) return;
        const record = toViewerRecord(body);
        if (body === null) {
          setViewer({ status: "unavailable" });
        } else if (record) {
          setViewer({ status: "ready", record });
        } else {
          setViewer({ status: "none" });
        }
      })
      .catch(() => {
        if (!cancelled) setViewer({ status: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [user, token, authLoading]);

  const viewerRecord = viewer.status === "ready" ? viewer.record : null;
  const viewerId = viewerRecord?.userId ?? null;

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (trimmed.length === 0) return climbers;
    const needle = trimmed.toLowerCase();
    return climbers.filter((c) => c.handle.toLowerCase().includes(needle));
  }, [climbers, trimmed]);

  const viewerInBoard =
    viewerId !== null && climbers.some((c) => c.userId === viewerId);
  const viewerVisible =
    viewerId !== null && filtered.some((c) => c.userId === viewerId);

  const handleFindMe = useCallback(() => {
    // Clearing the filter first guarantees the row is mounted when we scroll.
    setQuery("");
    requestAnimationFrame(() => {
      boardRef.current
        ?.querySelector(`#${YOUR_ROW_ID}`)
        ?.scrollIntoView({ block: "center" });
    });
  }, []);

  const noMatches = !unavailable && climbers.length > 0 && filtered.length === 0;

  return (
    <div className="mt-6">
      <BoardScopeNav />

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Your standing. First in the DOM so small screens lead with it. */}
        <div className="lg:col-start-2 lg:row-start-1">
          <YourBestPanel viewer={viewer} />
        </div>

        <div className="lg:col-start-1 lg:row-start-1" ref={boardRef}>
          {/* Filter row — client-side only; it narrows the rows already on the
              page and never refetches. */}
          {!unavailable && climbers.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="climber-search" className="sr-only">
                  Find a climber
                </label>
                <input
                  id="climber-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a climber"
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 min-h-[44px] text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                />
              </div>
              {viewerInBoard && (
                <button
                  type="button"
                  onClick={handleFindMe}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-signal/40 px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-signal transition-colors hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  Find me
                </button>
              )}
            </div>
          )}

          {noMatches ? (
            <div className="rounded-xl border border-border-strong bg-surface p-8 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
                [ no match ]
              </p>
              <p className="mt-3 text-sm text-text-secondary">
                No climber matches &ldquo;{trimmed}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-border-strong px-5 text-sm font-medium text-text-primary transition-colors hover:border-signal/50"
              >
                Clear search
              </button>
            </div>
          ) : (
            <ClimbLeaderboard
              climbers={filtered}
              unavailable={unavailable}
              highlightUserId={viewerId}
            />
          )}

          {/* Outside the fetched top 50 (or filtered out of view): pin the
              viewer's own standing under the board so it is never lost. */}
          {viewerRecord && !viewerVisible && !noMatches && (
            <PinnedViewerRow record={viewerRecord} />
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────── Presentational ─────────────────────────────

/**
 * Which board you are looking at. Plain navigation between the two boards
 * that exist — the free climb board and the 1v1 board stay separate pages.
 */
function BoardScopeNav() {
  return (
    <nav aria-label="Leaderboards" className="flex flex-wrap gap-2">
      <ScopeLink href="/climb" label="Solo" current />
      <ScopeLink href={DUEL_LEADERBOARD_HREF} label="1v1" />
    </nav>
  );
}

function ScopeLink({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        "inline-flex min-h-[44px] items-center rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (current
          ? "border-signal/60 bg-signal/10 text-signal"
          : "border-border-strong bg-surface text-text-secondary hover:border-signal/40 hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}

/**
 * The viewer's own standing plus the page's single primary CTA. Every state —
 * signed out, no record, failed read — still renders the CTA, so the panel is
 * never an empty box and the CTA has exactly one home on this page.
 */
function YourBestPanel({ viewer }: { viewer: ViewerState }) {
  const record = viewer.status === "ready" ? viewer.record : null;

  return (
    <section
      aria-label="Your best climb"
      data-climb-chrome
      className="climb-reveal relative overflow-hidden rounded-2xl border border-signal/30 bg-surface p-6 shadow-signal lg:sticky lg:top-4"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" aria-hidden="true" />

      <p className="relative font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        Your best climb
      </p>

      {record ? (
        <>
          <p className="relative mt-2 font-mono text-5xl font-bold tabular-nums leading-none text-text-primary">
            {record.peakY.toFixed(0)}
            <span className="ml-1 text-xl font-normal text-text-secondary">
              {ALTITUDE_UNIT}
            </span>
          </p>
          <dl className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
            <div className="bg-surface px-3 py-2.5">
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Your rank
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-signal">
                #{record.rank}
              </dd>
            </div>
            <div className="bg-surface px-3 py-2.5">
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Climbers
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-text-secondary">
                {record.totalClimbers}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="relative mt-3 text-sm leading-relaxed text-text-secondary">
          {viewer.status === "loading"
            ? "Checking your standing…"
            : viewer.status === "anonymous" ? (
                <>
                  <Link
                    href={`${SIGNIN_HREF}?redirect=%2Fclimb`}
                    className="text-signal underline underline-offset-4"
                  >
                    Sign in
                  </Link>{" "}
                  to record your height and take a rank.
                </>
              )
            : viewer.status === "none"
              ? "No recorded climb yet. Your best height becomes your rank."
              : "Your standing couldn’t be loaded right now."}
        </p>
      )}

      <div className="relative mt-6">
        <PlayTheClimbCta fullWidth />
      </div>
    </section>
  );
}

/** The viewer's row, pinned below the board when it isn't in view above. */
function PinnedViewerRow({ record }: { record: ViewerRecord }) {
  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        Your standing
      </p>
      <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-signal/50 bg-accent/6 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal font-mono text-sm font-bold tabular-nums text-void">
          {record.rank}
        </span>
        <span className="flex-1 truncate font-medium text-text-primary">You</span>
        <span className="font-mono font-bold tabular-nums text-signal">
          {record.peakY.toFixed(0)}
          <span className="font-normal text-text-secondary">{ALTITUDE_UNIT}</span>
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────── Helpers ──────────────────────────────────

/**
 * Narrow the dashboard payload to this surface's record, or null. Unchecked
 * `res.json()` casts are the repo's known runtime hazard (conventions.md), so
 * every field is verified before use instead of trusted.
 */
function toViewerRecord(body: unknown): ViewerRecord | null {
  if (typeof body !== "object" || body === null) return null;
  const { user, freeClimb } = body as {
    user?: unknown;
    freeClimb?: unknown;
  };
  if (typeof user !== "object" || user === null) return null;
  const userId = (user as { id?: unknown }).id;
  if (typeof userId !== "string" || userId.length === 0) return null;

  if (typeof freeClimb !== "object" || freeClimb === null) return null;
  const { peakY, rank, totalClimbers } = freeClimb as {
    peakY?: unknown;
    rank?: unknown;
    totalClimbers?: unknown;
  };
  if (
    typeof peakY !== "number" ||
    !Number.isFinite(peakY) ||
    typeof rank !== "number" ||
    !Number.isFinite(rank) ||
    typeof totalClimbers !== "number" ||
    !Number.isFinite(totalClimbers)
  ) {
    return null;
  }

  return { userId, peakY, rank, totalClimbers };
}
