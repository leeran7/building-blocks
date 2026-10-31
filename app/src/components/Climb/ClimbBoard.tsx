"use client";

/**
 * ClimbBoard — the /climb standings surface (ASCENT design).
 *
 * Composition (mockup 2): board scope row → [ search + find-me filter row +
 * ranked table ] beside a "your best" panel that carries the page's single
 * primary CTA. Below `lg` the panel stacks above the board, because "where do
 * I stand" is the first thing a returning climber wants. The frame around the
 * rows is BoardChrome, shared with /duel/leaderboard so the Solo | 1v1 switch
 * only swaps the rows.
 *
 * The standings themselves stay server-rendered and are passed in untouched —
 * this island exists only because Firebase identity is client-side. It reads
 * the EXISTING `GET /api/dashboard` (the same payload /dashboard already
 * fetches); every failure degrades to the CTA-only panel and never touches the
 * table.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { readSessionCache, writeSessionCache } from "../../lib/sessionCache";
import type { ClimberRank } from "../../db/climb";
import { ALTITUDE_UNIT } from "../../lib/units";
import { SIGNIN_HREF } from "../navLinks";
import {
  BoardCta,
  BoardFindMe,
  BoardLayout,
  BoardNoMatch,
  BoardSearch,
  StandingPanel,
} from "../Leaderboard/BoardChrome";
import { ClimbLeaderboard, YOUR_ROW_ID } from "./ClimbLeaderboard";

/** The slice of GET /api/dashboard this surface needs. Everything else is ignored. */
interface ViewerRecord {
  userId: string;
  peakY: number;
  rank: number;
  totalClimbers: number;
}

type ViewerState =
  | { status: "anonymous" }
  /** `signedIn`: the read is in flight, so the panel holds a record's shape. */
  | { status: "loading"; signedIn?: boolean }
  /** Signed in, request settled, but this climber has no recorded run. */
  | { status: "none" }
  | { status: "ready"; record: ViewerRecord }
  /** Signed in but the read failed — panel falls back to the CTA only. */
  | { status: "unavailable" };

/**
 * The last settled standing, for this tab (see sessionCache). A return to
 * /climb paints it at once (then refreshes), instead of a loading panel that
 * changes height when the read lands.
 */
const STANDING_KEY = "climb-standing";

function cachedStanding(uid: string): ViewerState {
  return readSessionCache<ViewerState>(uid, STANDING_KEY) ?? { status: "loading", signedIn: true };
}

/** What the panel shows on its first paint, before the effect below runs. */
function initialViewer(authLoading: boolean, uid: string | null, token: string | null): ViewerState {
  if (authLoading) return { status: "loading" };
  if (!uid || !token) return { status: "anonymous" };
  return cachedStanding(uid);
}

export function ClimbBoard({
  climbers,
  unavailable = false,
}: {
  climbers: ClimberRank[];
  unavailable?: boolean;
}) {
  const { user, token, loading: authLoading } = useAuth();
  const [viewer, setViewer] = useState<ViewerState>(() =>
    initialViewer(authLoading, user?.uid ?? null, token)
  );
  const [query, setQuery] = useState("");

  // Identity-derived read: early-return while auth is still resolving and keep
  // `authLoading` in deps, per context/conventions.md.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      setViewer({ status: "anonymous" });
      return;
    }

    let cancelled = false;
    const uid = user.uid;
    setViewer(cachedStanding(uid));

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
          return;
        }
        const next: ViewerState = record ? { status: "ready", record } : { status: "none" };
        writeSessionCache(uid, STANDING_KEY, next);
        setViewer(next);
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

  const noMatches = !unavailable && climbers.length > 0 && filtered.length === 0;

  return (
    <BoardLayout scope="solo" panel={<YourBestPanel viewer={viewer} />}>
      {!unavailable && climbers.length > 0 && (
        <BoardSearch id="climber-search" label="Find a climber" value={query} onChange={setQuery}>
          {viewerInBoard && (
            <BoardFindMe rowId={YOUR_ROW_ID} onClearSearch={() => setQuery("")} />
          )}
        </BoardSearch>
      )}

      {noMatches ? (
        <BoardNoMatch query={trimmed} noun="climber" onClear={() => setQuery("")} />
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
    </BoardLayout>
  );
}

// ────────────────────────────── Presentational ─────────────────────────────

const CLIMB_STATS = [
  { label: "Your rank", tone: "signal" },
  { label: "Climbers", tone: "secondary" },
] as const;

/**
 * The viewer's own standing plus the page's single primary CTA. Every state —
 * signed out, no record, failed read — still renders the CTA, so the panel is
 * never an empty box and the CTA has exactly one home on this page.
 */
function YourBestPanel({ viewer }: { viewer: ViewerState }) {
  const record = viewer.status === "ready" ? viewer.record : null;
  // Auth still resolving (a full page load) is not yet "signed in".
  const signedIn =
    viewer.status !== "anonymous" && !(viewer.status === "loading" && viewer.signedIn !== true);

  return (
    <StandingPanel
      label="Your best climb"
      signedIn={signedIn}
      pending={viewer.status === "loading" && viewer.signedIn === true}
      unit={ALTITUDE_UNIT}
      stats={CLIMB_STATS}
      record={
        record
          ? { value: record.peakY.toFixed(0), stats: [`#${record.rank}`, record.totalClimbers] }
          : null
      }
      message={
        viewer.status === "loading" ? (
          "Checking your standing…"
        ) : viewer.status === "anonymous" ? (
          <>
            <Link
              href={`${SIGNIN_HREF}?redirect=%2Fclimb`}
              className="text-signal underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to record your height and take a rank.
          </>
        ) : viewer.status === "none" ? (
          "No recorded climb yet. Your best height becomes your rank."
        ) : (
          "Your standing couldn’t be loaded right now."
        )
      }
      cta={<BoardCta href="/play">Play the climb</BoardCta>}
    />
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
