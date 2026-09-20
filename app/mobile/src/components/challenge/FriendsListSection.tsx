import { useCallback, useEffect, useState } from "react";
import { climberDisplay } from "@app/lib/handle";
import { apiFetch } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/haptics";
import { Button, ListRow } from "../ui";

interface Friend {
  id: string; // friendship id
  user: { id: string; displayName: string | null; username: string | null };
}

export interface FriendsListSectionProps {
  /** Bump this to force a refetch (e.g. after a friend request is accepted). */
  refreshKey?: number;
  /** Fired after a challenge is successfully sent, so the parent can refresh
   * the pending-challenges section. */
  onChallengeSent?: () => void;
}

/** Accepted friends, each with a "Challenge" action that sends an in-app challenge. */
export function FriendsListSection({ refreshKey, onChallengeSent }: FriendsListSectionProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState<Set<string>>(new Set());
  const [challengeErrors, setChallengeErrors] = useState<Set<string>>(new Set());

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

  const handleChallenge = useCallback(
    async (friendUserId: string) => {
      setChallengingId(friendUserId);
      setChallengeErrors((prev) => {
        if (!prev.has(friendUserId)) return prev;
        const next = new Set(prev);
        next.delete(friendUserId);
        return next;
      });
      try {
        const res = await apiFetch("/api/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: friendUserId, categorySlug: "tech" }),
        });
        if (res.ok) {
          setChallengeSent((prev) => new Set(prev).add(friendUserId));
          void notifySuccess();
          onChallengeSent?.();
        } else {
          setChallengeErrors((prev) => new Set(prev).add(friendUserId));
          void notifyError();
        }
      } catch {
        setChallengeErrors((prev) => new Set(prev).add(friendUserId));
        void notifyError();
      }
      setChallengingId(null);
    },
    [onChallengeSent],
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
        Friends
      </h2>

      {loading && (
        <p className="py-2 text-center font-mono text-xs text-text-muted" aria-live="polite">
          Loading friends…
        </p>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-2" role="alert">
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
            const name = climberDisplay(f.user.id, f.user.displayName);
            const sent = challengeSent.has(f.user.id);
            const errored = challengeErrors.has(f.user.id);
            return (
              <ListRow key={f.id}>
                <div className="flex w-full flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                      {f.user.username && (
                        <p className="truncate text-xs text-text-muted">@{f.user.username}</p>
                      )}
                    </div>
                    {sent ? (
                      <span className="shrink-0 font-mono text-xs uppercase tracking-[0.12em] text-signal">
                        Sent
                      </span>
                    ) : (
                      <Button
                        variant="primary"
                        fullWidth={false}
                        busy={challengingId === f.user.id}
                        onPress={() => handleChallenge(f.user.id)}
                      >
                        {errored ? "Retry" : "Challenge"}
                      </Button>
                    )}
                  </div>
                  {errored && (
                    <p className="font-mono text-xs text-ember" role="alert">
                      Could not send challenge. Try again.
                    </p>
                  )}
                </div>
              </ListRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
