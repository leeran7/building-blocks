import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/haptics";
import { Button, ListRow } from "../ui";

interface SearchResult {
  id: string;
  username: string | null;
  displayName: string | null;
}

export interface UserSearchSectionProps {
  /** Fired after a friend request is successfully sent, so the parent can
   * refresh the sent-requests section. */
  onFriendRequestSent?: () => void;
}

/**
 * Typeahead search to find a user by username and send a friend request.
 * Results render inline below the input rather than in a dropdown overlay,
 * which avoids z-index / keyboard-dismiss issues on mobile.
 */
export function UserSearchSection({ onFriendRequestSent }: UserSearchSectionProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = (await res.json()) as { users: SearchResult[] };
        setResults(data.users);
      }
    } catch {
      /* next keystroke recovers */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
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
          void notifyError();
        }
      } catch {
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username…"
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

      {!loading && query.length >= 2 && results.length === 0 && (
        <p className="py-1 text-center text-sm text-text-secondary">No users found.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((u) => {
            const name = u.displayName ?? u.username ?? "User";
            const sent = sentIds.has(u.id);
            return (
              <ListRow key={u.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
                  {u.username && u.displayName && (
                    <p className="truncate text-xs text-text-muted">@{u.username}</p>
                  )}
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
                    Add
                  </Button>
                )}
              </ListRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
