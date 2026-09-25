import { useCallback, useEffect, useRef, useState } from "react";
import { climberDisplay } from "@app/lib/handle";
import { isSearchableQuery, searchFailureMessage } from "@app/lib/userSearchQuery";
import { UsernameHandle } from "@app/components/Challenge/UsernameHandle";
import { apiFetch } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/haptics";
import { Button, ListRow } from "../ui";

interface SearchResult {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarId?: string | null;
}

export interface UserSearchSectionProps {
  /** Fired after a friend request is successfully sent, so the parent can
   * refresh the sent-requests section. */
  onFriendRequestSent?: () => void;
}

/**
 * Look up a user by their exact email or exact username and send a friend
 * request. Results render inline below the input rather than in a dropdown
 * overlay, which avoids z-index / keyboard-dismiss issues on mobile.
 *
 * Search only fires once the input looks like a complete email or a valid
 * username — a partial value wouldn't match anything server-side anyway (the
 * API is exact-match only).
 */
export function UserSearchSection({ onFriendRequestSent }: UserSearchSectionProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (!isSearchableQuery(q)) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = (await res.json()) as { users: SearchResult[] };
        setResults(data.users);
        setSearched(true);
      } else {
        // Never leave the previous query's row (and its Add button) on screen
        // next to a different query — one tap would add the wrong person.
        setResults([]);
        setSearchError(searchFailureMessage(res.status));
        void notifyError();
      }
    } catch {
      setResults([]);
      setSearchError(searchFailureMessage(null));
      void notifyError();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearched(false);
    setSearchError(null);
    if (!isSearchableQuery(query)) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleAdd = useCallback(
    async (userId: string) => {
      setAddingId(userId);
      setErrorIds((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      try {
        const res = await apiFetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId: userId }),
        });
        if (res.ok) {
          setSentIds((prev) => new Set(prev).add(userId));
          void notifySuccess();
          onFriendRequestSent?.();
        } else {
          setErrorIds((prev) => new Set(prev).add(userId));
          void notifyError();
        }
      } catch {
        setErrorIds((prev) => new Set(prev).add(userId));
        void notifyError();
      }
      setAddingId(null);
    },
    [onFriendRequestSent],
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
        Add friends
      </h2>

      <div className="relative">
        <input
          type="text"
          inputMode="email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or username…"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-2xl border border-border-strong bg-surface-raised px-4 py-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-signal/50 focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted active:scale-90"
          >
            ✕
          </button>
        )}
      </div>

      {loading && (
        <p className="text-center font-mono text-xs text-text-muted" aria-live="polite">
          Searching…
        </p>
      )}

      {!loading && searchError && (
        <p className="py-1 text-center font-mono text-xs text-ember" role="alert">
          {searchError}
        </p>
      )}

      {!loading && !searchError && searched && results.length === 0 && (
        <p className="py-1 text-center text-sm text-text-secondary">
          No user found with that email or username.
        </p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((u) => {
            const name = climberDisplay(u.id, u.displayName, u.avatarId);
            const sent = sentIds.has(u.id);
            const errored = errorIds.has(u.id);
            return (
              <ListRow key={u.id}>
                <div className="flex w-full flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                      <UsernameHandle username={u.username} />
                    </div>
                    {sent ? (
                      <span className="shrink-0 font-mono text-xs uppercase tracking-[0.12em] text-signal">
                        Sent
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        fullWidth={false}
                        busy={addingId === u.id}
                        onPress={() => handleAdd(u.id)}
                      >
                        {errored ? "Retry" : "Add"}
                      </Button>
                    )}
                  </div>
                  {errored && (
                    <p className="font-mono text-xs text-ember" role="alert">
                      Could not send request. Try again.
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
