"use client";

/**
 * /duel home: matchmaking + private challenge + W-L record.
 *
 * Composition (mockup 1): tier pills (Free / Ranked / Tournaments) → the two
 * free entries side by side (Quick Match, Challenge a friend) → a matchmaking
 * status bar that exists only while a search is live → friends & pending
 * challenges → your record strip.
 *
 * Canonical primary action = "Find opponent" (filled signal). Creating a
 * private challenge link is the secondary path (signal outline), so the
 * surface still has one dominant action per DESIGN.md. Signed-out users see a
 * SINGLE sign-in gate that replaces the actions entirely — no repeated ask.
 *
 * The record strip deliberately carries no leaderboard link: the tab band at
 * the top of this same screen already points at /duel/leaderboard.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { shareInvite } from "../../lib/shareInvite";
import { parseDuelInvite } from "../../lib/duelInvite";
import { DuelStackShell } from "./DuelStackShell";
import { BuyCreditsModal } from "../Wallet/BuyCreditsModal";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";
import { formatChipCents } from "../../config/chipPackages";
import { useClaimDailyChips } from "../../hooks/useClaimDailyChips";
import { useRankedEligibility } from "../../hooks/useRankedEligibility";
import { useWalletBalance } from "../../hooks/useWalletBalance";
import { authedFetch } from "../../lib/authedFetch";
import { CHIP_DUELS_HREF } from "../navLinks";
import { Spinner } from "../ui/Spinner";
import { SignInGate } from "../ui/SignInGate";
import { Button } from "../ui/Button";
import { UserSearch } from "../Challenge/UserSearch";
import { PendingChallenges } from "../Challenge/PendingChallenges";
import { FriendsList } from "../Challenge/FriendsList";
import { FriendRequests } from "../Challenge/FriendRequests";

// ─────────────────────────────── Types ────────────────────────────────────

interface DuelStats {
  wins: number;
  losses: number;
  current_streak: number;
}

/**
 * Which tier of 1v1 the player is looking at. Free shows both entries (quick
 * match + private challenge) at once; the paid tiers each own a panel.
 * Tournaments is never selectable yet — its pill is disabled.
 */
type DuelTier = "free" | "chips" | "tournaments";

/**
 * Creating a challenge navigates straight into the duel lobby (the canonical
 * home for the invite), so there is no post-create "here is your link" state.
 * An already-open challenge is resolved automatically (see handleCreate) —
 * it's just as good as a fresh one (no seed committed until someone joins),
 * so re-sharing it and dropping the creator back into that lobby needs no
 * decision from them. Only the in-flight and failure cases live here.
 */
type CreateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type QueueState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "timeout" }
  | { status: "error"; message: string };

// ─────────────────────────────── Component ────────────────────────────────

export function DuelHome() {
  const { user, token, isAnonymous } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ?mode= predates the tier split; the two free entries now live on one
  // panel, so both legacy values resolve to the free tier.
  const initialTier = ((): DuelTier => {
    const param = searchParams.get("mode");
    if (param === "chips" || param === "tournaments") return param;
    return "free";
  })();

  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [queueState, setQueueState] = useState<QueueState>({ status: "idle" });
  const [stats, setStats] = useState<DuelStats | null>(null);
  const [tier, setTier] = useState<DuelTier>(initialTier);
  const [buyOpen, setBuyOpen] = useState(false);
  const { state: claimState, claim } = useClaimDailyChips(token);
  const { allowed: geoAllowed } = useRankedEligibility(PAID_DUELS_ENABLED_PUBLIC);
  const { playCents: chipBalance } = useWalletBalance(
    PAID_DUELS_ENABLED_PUBLIC ? token : null,
    `${Number(buyOpen)}-${claimState.status}`
  );

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const prevCreateStatus = useRef(createState.status);

  // Restore focus to the Create button when dismissing the "existing
  // challenge" / error states back to idle, so keyboard focus doesn't fall
  // into the void when that content disappears.
  useEffect(() => {
    if (prevCreateStatus.current !== "idle" && createState.status === "idle") {
      createButtonRef.current?.focus();
    }
    prevCreateStatus.current = createState.status;
  }, [createState.status]);

  // Fetch W-L stats on mount when signed in
  useEffect(() => {
    if (!user || !token) return;
    authedFetch("/api/duel/stats", token)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DuelStats | null) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, [user, token]);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─────────────── Create challenge ───────────────

  const handleCreate = useCallback(async () => {
    if (!token) return;
    setCreateState({ status: "loading" });

    try {
      const res = await authedFetch("/api/duel", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: "tech" }),
      });

      if (res.status === 409) {
        // Already have an open challenge — it's just as good as a fresh one
        // (no seed is committed until someone joins), so resolve this
        // automatically rather than asking the creator to choose: re-share
        // that link and drop them into its lobby, exactly like a new create.
        const body = (await res.json()) as { existingId: string };
        const link = `${window.location.origin}/duel/${body.existingId}`;
        await shareInvite(link).catch(() => {});
        router.push(`/duel/${body.existingId}`);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setCreateState({
          status: "error",
          message: body.error ?? "Could not create challenge.",
        });
        return;
      }

      const body = (await res.json()) as { id: string; link: string };
      // Offer the native share sheet right away — we're still inside the click's
      // transient activation (the POST above is fast), which navigator.share
      // requires. Best-effort only: if the window has lapsed or sharing isn't
      // available, the lobby's "Share invite" button is the guaranteed path.
      await shareInvite(body.link).catch(() => {});
      // Seamless: drop the creator straight into the waiting lobby (where they
      // can share the invite and warm up) instead of a static copy screen.
      router.push(`/duel/${body.id}`);
    } catch {
      setCreateState({ status: "error", message: "Network error. Please try again." });
    }
  }, [token, router]);

  // ─────────────── Queue ───────────────

  const handleSearch = useCallback(async () => {
    if (!token) return;
    setQueueState({ status: "searching" });

    // Poll the read-only status endpoint every 2s (GET, not a re-POST:
    // re-joining would blow the join rate limit and re-enqueue us). The queue
    // has a TTL server-side; once it lapses the endpoint returns `expired`, so
    // we surface a "timed out" state instead of spinning forever.
    const beginPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await authedFetch("/api/duel/queue", token);
          if (!pollRes.ok) return;
          const pollBody = (await pollRes.json()) as { status: string; duelId?: string };
          if (pollBody.status === "matched" && pollBody.duelId) {
            if (pollRef.current) clearInterval(pollRef.current);
            setQueueState({ status: "idle" });
            router.push(`/duel/${pollBody.duelId}`);
            return;
          }
          if (pollBody.status === "expired") {
            // TTL lapsed with no match — stop polling and offer a retry rather
            // than leaving the spinner running indefinitely.
            if (pollRef.current) clearInterval(pollRef.current);
            setQueueState({ status: "timeout" });
          }
        } catch {
          // Ignore poll errors — the next tick recovers.
        }
      }, 2000);
    };

    try {
      const res = await authedFetch("/api/duel/queue", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: "tech" }),
      });

      // Already holding a queue slot from a previous search — just resume polling.
      if (res.status === 409) {
        beginPolling();
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setQueueState({ status: "error", message: body.error ?? "Could not join queue." });
        return;
      }

      const body = (await res.json()) as { status: string; duelId?: string };
      if (body.status === "matched" && body.duelId) {
        setQueueState({ status: "idle" });
        router.push(`/duel/${body.duelId}`);
        return;
      }
      if (body.status === "expired") {
        setQueueState({ status: "timeout" });
        return;
      }

      // Waiting — start polling for the match.
      beginPolling();
    } catch {
      setQueueState({ status: "error", message: "Network error. Please try again." });
    }
  }, [token, router]);

  const handleCancelSearch = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQueueState({ status: "idle" });
    if (!token) return;
    try {
      await authedFetch("/api/duel/queue", token, { method: "DELETE" });
    } catch {
      // Best-effort
    }
  }, [token]);

  // ─────────────── Open a challenge link ───────────────

  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleOpenInvite = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Allow-list parse: anything that isn't provably a duel id is rejected,
      // and the route is rebuilt from the parsed id, never from the raw input.
      const duelId = parseDuelInvite(inviteInput);
      if (!duelId) {
        setInviteError("That doesn’t look like a Doomstack challenge link.");
        return;
      }
      setInviteError(null);
      router.push(`/duel/${duelId}`);
    },
    [inviteInput, router]
  );

  // ─────────────── In-app challenge ───────────────

  const [challengeSending, setChallengeSending] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);

  // Cross-section refresh: each key is bumped when a related write succeeds
  // elsewhere on this screen, so siblings refetch instead of going stale
  // until the user switches mode tabs away and back.
  const [friendsRefreshKey, setFriendsRefreshKey] = useState(0);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);
  const [challengesRefreshKey, setChallengesRefreshKey] = useState(0);

  const handleFriendAccepted = useCallback(() => {
    setFriendsRefreshKey((k) => k + 1);
  }, []);

  const handleAddFriend = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!token) return false;
      setAddingFriend(true);
      let ok = false;
      try {
        const res = await authedFetch("/api/friends", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId: userId }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      setAddingFriend(false);
      if (ok) setRequestsRefreshKey((k) => k + 1);
      return ok;
    },
    [token]
  );

  const handleInAppChallenge = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!token) return false;
      setChallengeSending(true);
      let ok = false;
      try {
        const res = await authedFetch("/api/challenge", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: userId, categorySlug: "tech" }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      setChallengeSending(false);
      if (ok) setChallengesRefreshKey((k) => k + 1);
      return ok;
    },
    [token]
  );

  // ─────────────── Render ───────────────

  const paidEnabled = PAID_DUELS_ENABLED_PUBLIC;
  const geoBlocked = paidEnabled && geoAllowed === false;
  // Tournaments is never selectable yet, and the chips tier collapses back to
  // free when the kill switch is off or the region is blocked.
  const activeTier: DuelTier =
    tier === "tournaments" || (tier === "chips" && (!paidEnabled || geoBlocked))
      ? "free"
      : tier;
  const searching = queueState.status === "searching";
  const elapsed = useElapsedSeconds(searching);
  // Anonymous Firebase sessions have no email, so ensureUser can't provision a
  // `users` row and creating/queuing would 500 on the duels FK (same exclusion
  // as ClimbScene). They get the sign-in gate like signed-out visitors.
  const signedOut = !user || isAnonymous;

  return (
    <DuelStackShell section="play">
      <div className="pt-7 pb-16 flex flex-col gap-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1.5">
            multiplayer
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight uppercase text-text-primary leading-none">
            1v1 Arena
          </h1>
          <p className="text-sm text-text-secondary mt-3 max-w-md">
            Same tower. Same rising lava. Outclimb your rival.
          </p>
        </header>

        {/* Tier pills — a segmented control, not a tabs widget: selecting a
            tier swaps the panel below via React state, but there's no roving
            tabIndex / arrow-key navigation, so it doesn't get to claim the
            role="tab" contract. aria-pressed communicates selection instead.
            With paid duels off there is exactly one tier, so the row renders
            nothing rather than a lone decorative pill. */}
        {paidEnabled && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="1v1 tiers">
            <TierPill
              label="Free 1v1"
              selected={activeTier === "free"}
              onSelect={() => setTier("free")}
            />
            <TierPill
              label="Ranked chips"
              note={geoBlocked ? "region limited" : "18+ · stake chips"}
              selected={activeTier === "chips"}
              disabled={geoBlocked}
              onSelect={() => setTier("chips")}
            />
            <TierPill label="Tournaments" note="coming soon" selected={false} disabled />
          </div>
        )}

        {/* Signed-out users get ONE sign-in gate that stands in for every
            entry — no repeated ask. */}
        {signedOut ? (
          <SignInGate message="Sign in to get matched, challenge a friend, and save your record." redirectPath="/duel" />
        ) : activeTier === "free" ? (
          <>
            {/* Always-mounted live regions — a region that only appears
                alongside its own content can miss the announcement on some
                SR/browser combos. */}
            <p className="sr-only" aria-live="polite">
              {queueState.status === "searching"
                ? "Searching for an opponent…"
                : queueState.status === "timeout"
                  ? "Search timed out — no opponent found."
                  : queueState.status === "error"
                    ? queueState.message
                    : ""}
            </p>
            <p className="sr-only" aria-live="polite">
              {createState.status === "loading"
                ? "Creating challenge…"
                : createState.status === "error"
                  ? createState.message
                  : ""}
            </p>

            {/* The two ways into a free match, side by side. */}
            <div className="grid gap-4 md:grid-cols-2">
              <EntryCard
                id="free-duel"
                icon={<BoltIcon />}
                title="Quick Match"
                badge="free"
                tone="primary"
                description="Find a random rival. Race the same tower and the same lava."
                footnote="Cancel anytime while searching."
              >
                {queueState.status === "timeout" ? (
                  <div className="flex flex-col gap-3" role="status">
                    <p className="text-text-secondary text-sm">
                      Search timed out — no opponent found.
                    </p>
                    <Button variant="primary" size="lg" fullWidth onClick={handleSearch}>
                      Search again
                    </Button>
                  </div>
                ) : queueState.status === "error" ? (
                  <div className="flex flex-col gap-2" role="alert">
                    <p className="text-ember text-sm">{queueState.message}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQueueState({ status: "idle" })}
                      className="w-fit"
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={handleSearch}
                    disabled={searching}
                  >
                    {searching ? "Finding a rival…" : "Find opponent"}
                  </Button>
                )}
              </EntryCard>

              <EntryCard
                icon={<TargetIcon />}
                title="Challenge a friend"
                badge="private"
                tone="secondary"
                description="Create a link. Put a friend against the same rise."
                footnote="Your friend can join as a guest."
              >
                {createState.status === "loading" ? (
                  <div className="flex items-center gap-2 text-text-secondary text-sm min-h-[48px]">
                    <Spinner />
                    Creating…
                  </div>
                ) : createState.status === "error" ? (
                  <div className="flex flex-col gap-2" role="alert">
                    <p className="text-ember text-sm">{createState.message}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateState({ status: "idle" })}
                      className="w-fit"
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <Button
                    ref={createButtonRef}
                    variant="signal-outline"
                    size="lg"
                    fullWidth
                    onClick={handleCreate}
                  >
                    Create invite link
                  </Button>
                )}

                {/* Entry point for the other side of the invite. */}
                <form onSubmit={handleOpenInvite} className="mt-4 border-t border-border-subtle pt-4">
                  <label
                    htmlFor="duel-invite"
                    className="block font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted"
                  >
                    Have an invite?
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="duel-invite"
                      name="invite"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      value={inviteInput}
                      onChange={(e) => {
                        setInviteInput(e.target.value);
                        if (inviteError) setInviteError(null);
                      }}
                      placeholder="Paste a challenge link"
                      aria-invalid={inviteError ? true : undefined}
                      aria-describedby={inviteError ? "duel-invite-error" : undefined}
                      className="min-w-0 flex-1 rounded-lg border border-border-strong bg-void px-3 min-h-[44px] text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
                    <Button type="submit" variant="ghost" size="sm" className="shrink-0">
                      Open
                    </Button>
                  </div>
                  {inviteError && (
                    <p id="duel-invite-error" className="mt-2 text-xs text-ember" role="alert">
                      {inviteError}
                    </p>
                  )}
                </form>
              </EntryCard>
            </div>

            {/* Matchmaking state — exists only while a search is live. */}
            {searching && (
              <section
                aria-label="Matchmaking state"
                className="rounded-xl border border-signal/30 bg-surface p-4 sm:px-5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                  Matchmaking state
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Spinner size="lg" />
                  <span className="text-sm text-text-secondary">Finding a rival…</span>
                  <span className="h-5 w-px bg-border-strong" aria-hidden="true" />
                  <span className="font-mono text-sm tabular-nums text-signal">
                    {formatElapsed(elapsed)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelSearch}
                    className="ml-auto shrink-0"
                  >
                    Cancel search
                  </Button>
                </div>
                <div
                  className="mt-4 h-px w-full bg-linear-to-r from-signal/60 via-signal/20 to-transparent"
                  aria-hidden="true"
                />
              </section>
            )}

            {/* Friends, requests, and challenges you've been sent. */}
            <section className="bg-surface rounded-xl border border-border-subtle p-6 flex flex-col gap-5">
              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
                  Add friend
                </h2>
                <p className="text-text-secondary text-sm mb-3">
                  Find players by email.
                </p>
                <UserSearch
                  onSelect={handleAddFriend}
                  actionLabel="Add"
                  placeholder="Search by email…"
                  disabled={addingFriend}
                />
              </div>

              <FriendRequests refreshKey={requestsRefreshKey} onAccepted={handleFriendAccepted} />

              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
                  Challenge a friend
                </h2>
                <p className="text-text-secondary text-sm mb-3">
                  Pick a friend to challenge to a 1v1.
                </p>
                <FriendsList
                  onChallenge={handleInAppChallenge}
                  disabled={challengeSending}
                  refreshKey={friendsRefreshKey}
                />
              </div>

              <PendingChallenges refreshKey={challengesRefreshKey} />
            </section>
          </>
        ) : activeTier === "chips" ? (
          <section className="bg-surface rounded-xl border border-signal/30 shadow-signal p-6">
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">
                Chip Duels
              </h2>
              {chipBalance !== null && (
                <span className="font-mono text-xs tabular-nums text-signal">
                  {formatChipCents(chipBalance)} chips
                </span>
              )}
            </div>
            <p className="text-text-secondary text-sm mb-5">
              Stake non-cashable chips against another player. Winner takes all — zero-sum, no house cut.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={CHIP_DUELS_HREF}
                className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100 shadow-signal transition-[filter,transform,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
              >
                Find chip match
              </Link>
              <Button variant="ghost" size="sm" fullWidth onClick={() => setBuyOpen(true)}>
                Buy chips
              </Button>
              <button
                onClick={claim}
                disabled={
                  claimState.status === "claiming" ||
                  claimState.status === "claimed" ||
                  claimState.status === "already-claimed"
                }
                className="text-center text-xs text-text-muted underline underline-offset-2 hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claimState.status === "claiming"
                  ? "Claiming..."
                  : claimState.status === "claimed"
                    ? "Claimed today's free chips"
                    : claimState.status === "already-claimed"
                      ? "Already claimed today"
                      : "Claim your free daily chips"}
              </button>
              {claimState.status === "error" && (
                <p className="text-center text-xs text-ember" role="alert">{claimState.message}</p>
              )}
            </div>
            <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} token={token} />
          </section>
        ) : null}

        {/* Your record — the closing line of the page. No leaderboard link:
            the tab band above already points at /duel/leaderboard, and
            DESIGN.md forbids the same ask twice on one screen. */}
        {stats && (
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border-subtle pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Your free 1v1 record
            </p>
            <div className="flex items-center gap-5 font-mono tabular-nums">
              <RecordStat value={stats.wins} label="W" tone="signal" />
              <RecordStat value={stats.losses} label="L" tone="muted" />
              {stats.current_streak !== 0 && (
                <RecordStat
                  value={
                    stats.current_streak > 0
                      ? `+${stats.current_streak}`
                      : stats.current_streak
                  }
                  label="streak"
                  tone={stats.current_streak > 0 ? "signal" : "ember"}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </DuelStackShell>
  );
}

// ─────────────────────────────── Hooks ─────────────────────────────────────

/**
 * Seconds since `active` last became true, ticking at 1 Hz. Resets to 0 on
 * every transition and clears its interval on unmount — the matchmaking bar
 * mounts and unmounts with the search, so a leaked interval would survive the
 * queue it was timing.
 */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    if (!active) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

/**
 * `m:ss` for an elapsed-seconds count (no hour component — queues are short).
 *
 * Non-finite input reads as 0, not `NaN:NaN`: `Math.max`/`Math.min` propagate
 * NaN through any argument, so the clamp needs an explicit finiteness guard.
 */
export function formatElapsed(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ─────────────────────────── Presentational ────────────────────────────────

function RecordStat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone: "signal" | "ember" | "muted";
}) {
  const color =
    tone === "signal" ? "text-signal" : tone === "ember" ? "text-ember" : "text-text-secondary";
  return (
    <div className="text-right leading-none">
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      <span className="text-text-muted text-[10px] uppercase tracking-[0.12em] ml-1">{label}</span>
    </div>
  );
}

/**
 * One tier in the segmented tier row. A button with `aria-pressed` — not a
 * `role="tab"` widget, since there is no roving tabIndex / arrow-key nav.
 */
function TierPill({
  label,
  note,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  /** Small qualifier under the label (age gate, region, availability). */
  note?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={
        "inline-flex min-h-[44px] flex-col items-center justify-center rounded-full border px-5 py-1.5 transition-[border-color,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (disabled
          ? "border-border-subtle bg-surface-raised opacity-50 cursor-not-allowed"
          : selected
            ? "border-signal/60 bg-signal/10 text-signal"
            : "border-border-strong bg-surface text-text-secondary hover:border-signal/40 hover:text-text-primary")
      }
    >
      <span className="text-sm font-semibold tracking-tight">{label}</span>
      {note && (
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
          {note}
        </span>
      )}
    </button>
  );
}

/**
 * One way into a match. `primary` carries the dominant action of the screen
 * (signal ring + glow); `secondary` is the same card at a lower weight, so the
 * pair reads as one primary + one alternative rather than two equal asks.
 */
function EntryCard({
  id,
  icon,
  title,
  badge,
  tone,
  description,
  footnote,
  children,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  badge: string;
  tone: "primary" | "secondary";
  description: string;
  /** Quiet line under the action — expectation setting, not a second CTA. */
  footnote: string;
  children: ReactNode;
}) {
  const isPrimary = tone === "primary";
  return (
    <section
      id={id}
      aria-labelledby={`${slugify(title)}-title`}
      className={
        "flex flex-col rounded-xl border bg-surface p-6 scroll-mt-20 " +
        (isPrimary ? "border-signal/30 shadow-signal" : "border-border-subtle")
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border " +
            (isPrimary
              ? "border-signal/50 bg-signal/10 text-signal"
              : "border-border-strong text-text-secondary")
          }
          aria-hidden="true"
        >
          {icon}
        </span>
        <h2
          id={`${slugify(title)}-title`}
          className="font-display text-2xl font-bold tracking-tight text-text-primary"
        >
          {title}
        </h2>
        <span
          className={
            "ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] " +
            (isPrimary ? "bg-signal/15 text-signal" : "bg-void/60 text-text-muted")
          }
        >
          {badge}
        </span>
      </div>

      <p className="text-sm text-text-secondary mt-3">{description}</p>

      <div className="mt-5">{children}</div>

      <p className="mt-3 text-xs text-text-muted">{footnote}</p>
    </section>
  );
}

/** Lowercase, hyphenated id fragment for aria-labelledby wiring. */
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}


