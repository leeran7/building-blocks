import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { notifyError, notifySuccess, tapMedium } from "../../lib/haptics";
import { Button, ListRow } from "../ui";

interface Friend {
  id: string; // friendship id
  user: { id: string; displayName: string | null; username: string | null };
}

export interface FriendsListSectionProps {
  /** Bump this to force a refetch (e.g. after a friend request is accepted). */
  refreshKey?: number;
}

/** Accepted friends, each with a "Challenge" action that sends an in-app challenge. */
export function FriendsListSection({ refreshKey }: FriendsListSectionProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState<Set<string>>(new Set());

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/friends");
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
  }, []);

  useEffect(() => {
    fetchFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFriends, refreshKey]);

  const handleChallenge = useCallback(async (friendUserId: string) => {
    void tapMedium();
    setChallengingId(friendUserId);
    try {
      const res = await apiFetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: friendUserId, categorySlug: "tech" }),
      });
      if (res.ok) {
        setChallengeSent((prev) => new Set(prev).add(friendUserId));
        void notifySuccess();
      } else {
        void notifyError();
      }
    } catch {
      void notifyError();
    }
    setChallengingId(null);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
        Friends
      </h2>

      {loading && (
        <p className="py-2 text-center font-mono text-xs text-text-muted">Loading friends…</p>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-sm text-ember">{error}</p>
          <Button variant="ghost" fullWidth={false} onPress={fetchFriends}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && friends.length === 0 && (
        <p className="py-1 text-sm text-text-secondary">
          No friends yet — search below to add some.
        </p>
      )}

      {!loading && !error && friends.length > 0 && (
        <div className="flex flex-col gap-2">
          {friends.map((f) => {
            const name = f.user.displayName ?? f.user.username ?? "Friend";
            const sent = challengeSent.has(f.user.id);
            return (
              <ListRow key={f.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                  {f.user.username && f.user.displayName && (
                    <p className="truncate text-xs text-text-muted">@{f.user.username}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={sent || challengingId === f.user.id}
                  onClick={() => handleChallenge(f.user.id)}
                  className="shrink-0 font-mono text-xs uppercase tracking-[0.12em] text-signal disabled:text-text-muted"
                >
                  {sent ? "Sent" : challengingId === f.user.id ? "…" : "Challenge"}
                </button>
              </ListRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
