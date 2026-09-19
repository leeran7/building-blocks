"use client";

/**
 * FriendsList -- displays the user's friends with a "Challenge" button next
 * to each. Fetches from GET /api/friends on mount.
 *
 * States: loading, empty, populated, error (network).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

interface Friend {
  id: string; // friendship id
  user: { id: string; displayName: string | null; username: string | null };
}

interface FriendsListProps {
  onChallenge: (userId: string, displayName: string) => void;
  disabled?: boolean;
}

export function FriendsList({ onChallenge, disabled }: FriendsListProps) {
  const { token } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [fetchFriends]);

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
        const name =
          friend.user.displayName ?? friend.user.username ?? "Friend";
        const showUsername =
          friend.user.displayName && friend.user.username;

        return (
          <div
            key={friend.id}
            className="rounded-lg border border-border-subtle bg-surface p-3 flex items-center justify-between gap-3"
          >
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
            <Button
              variant="primary"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChallenge(
                  friend.user.id,
                  friend.user.displayName ??
                    friend.user.username ??
                    "Friend"
                )
              }
            >
              Challenge
            </Button>
          </div>
        );
      })}
    </div>
  );
}
