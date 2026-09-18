"use client";

/**
 * UserSearch — typeahead search to find a user by username and perform an action.
 *
 * Generic: the caller decides the action label (default "Add") and receives
 * the selected user via `onSelect`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { Spinner } from "../ui/Spinner";

interface SearchResult {
  id: string;
  username: string | null;
  displayName: string | null;
}

interface UserSearchProps {
  onSelect: (userId: string, displayName: string) => void;
  disabled?: boolean;
  placeholder?: string;
  actionLabel?: string;
}

export function UserSearch({
  onSelect,
  disabled,
  placeholder = "Search by username…",
  actionLabel = "Add",
}: UserSearchProps) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (!token || q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await authedFetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          token
        );
        if (res.ok) {
          const data = (await res.json()) as { users: SearchResult[] };
          setResults(data.users);
          setOpen(data.users.length > 0);
        }
      } catch {}
      setLoading(false);
    },
    [token]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-border-strong bg-void px-3 py-2.5 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-signal/50 focus:outline-none focus:ring-1 focus:ring-signal/30 transition-colors disabled:opacity-50"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner />
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-border-strong bg-surface-raised shadow-lifted overflow-hidden">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => {
                  const name = user.displayName ?? user.username ?? "User";
                  onSelect(user.id, name);
                  setQuery("");
                  setOpen(false);
                  setResults([]);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-elevated transition-colors flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {user.displayName ?? user.username}
                  </p>
                  {user.username && user.displayName && (
                    <p className="text-xs text-text-muted truncate">@{user.username}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-mono text-signal uppercase tracking-wider">
                  {actionLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
