"use client";

/**
 * FriendsList -- displays the user's friends with a "Challenge" button next
 * to each. Fetches from GET /api/friends on mount.
 *
 * States: loading, empty, populated, error (network), per-row challenge
 * sent/error feedback.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { climberDisplay } from "../../lib/handle";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

interface Friend {
  id: string; // friendship id
  user: { id: string; displayName: string | null; username: string | null };
}

interface FriendsListProps {
  onChallenge: (userId: string, displayName: string) => Promise<boolean>;
  disabled?: boolean;
  /** Bump this to force a refetch (e.g. after a friend request is accepted). */
  refreshKey?: number;
}

export function FriendsList({ onChallenge, disabled, refreshKey }: FriendsListProps) {
  const { token } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState<Set<string>>(new Set());
  const [challengeErrors, setChallengeErrors] = useState<Set<string>>(new Set());

  const fetchFriends = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/friends", token);
      if (res.ok) {
        const data = (await res.json()) as { friends: Friend[] };
        setFriends(data.friends);
      } else {
        setError("Could not load friends.");
      }
    } catch {
      setError("Network error loading friends.");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFriends, refreshKey]);

  const handleChallenge = useCallback(
    async (userId: string, displayName: string) => {
      setChallengingId(userId);
      setChallengeErrors((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      const ok = await onChallenge(userId, displayName);
      if (ok) {
        setChallengeSent((prev) => new Set(prev).add(userId));
      } else {
        setChallengeErrors((prev) => new Set(prev).add(userId));
      }
      setChallengingId(null);
    },
    [onChallenge]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-2">
        <Spinner /> Loading friends...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-ember text-sm">{error}</p>
        <Button variant="ghost" size="sm" onClick={fetchFriends} className="w-fit">
          Retry
        </Button>
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <p className="text-text-muted text-sm py-2">
        No friends yet. Search above to add friends!
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {friends.map((friend) => {
        const name = climberDisplay(friend.user.id, friend.user.displayName);
        const showUsername = Boolean(friend.user.username);
        const sent = challengeSent.has(friend.user.id);
        const errored = challengeErrors.has(friend.user.id);
        const challenging = challengingId === friend.user.id;

        return (
          <div
            key={friend.id}
            className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {name}
                </p>
                {showUsername && (
                  <p className="text-xs text-text-muted truncate">
                    @{friend.user.username}
                  </p>
                )}
              </div>
              {sent ? (
                <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-signal">
                  Sent
                </span>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={disabled || challenging}
                  onClick={() => handleChallenge(friend.user.id, name)}
                >
                  {challenging ? "…" : errored ? "Retry" : "Challenge"}
                </Button>
              )}
            </div>
            {errored && (
              <p className="text-ember text-xs" role="alert">
                Could not send challenge. Try again.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
