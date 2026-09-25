"use client";

/**
 * UserSearch — look up a user by their exact email or exact username and
 * perform an action.
 *
 * Generic: the caller decides the action label (default "Add") and receives
 * the selected user via `onSelect`, which returns whether the action
 * succeeded so this component can show inline per-row feedback (rather than
 * relying on the parent to surface it somewhere else).
 *
 * Search only fires once the input looks like a complete email or a valid
 * username — a partial value wouldn't match anything server-side anyway (the
 * API is exact-match only), so there's no point querying on every keystroke.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { climberDisplay } from "../../lib/handle";
import { UsernameHandle } from "./UsernameHandle";
import { isSearchableQuery, searchFailureMessage } from "../../lib/userSearchQuery";
import { Spinner } from "../ui/Spinner";

interface SearchResult {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarId?: string | null;
}

interface UserSearchProps {
  onSelect: (userId: string, displayName: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  /** The field's accessible name. It stays when the placeholder goes, once the user types. */
  label?: string;
  actionLabel?: string;
  sentLabel?: string;
}

export function UserSearch({
  onSelect,
  disabled,
  placeholder = "Search by email or username…",
  label = "Search by email or username",
  actionLabel = "Add",
  sentLabel = "Sent",
}: UserSearchProps) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (!token || !isSearchableQuery(q)) {
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
          setOpen(true);
          setSearched(true);
        } else {
          // Never leave the previous query's row (and its action button) on
          // screen next to a different query — one click would act on the
          // wrong person.
          setResults([]);
          setSearchError(searchFailureMessage(res.status));
          setOpen(true);
        }
      } catch {
        setResults([]);
        setSearchError(searchFailureMessage(null));
        setOpen(true);
      }
      setLoading(false);
    },
    [token]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearched(false);
    setSearchError(null);
    if (!isSearchableQuery(query)) {
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

  const handleSelect = useCallback(
    async (user: SearchResult) => {
      setActioningId(user.id);
      setErrorIds((prev) => {
        if (!prev.has(user.id)) return prev;
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
      const name = climberDisplay(user.id, user.displayName, user.avatarId);
      const ok = await onSelect(user.id, name);
      if (ok) {
        setSentIds((prev) => new Set(prev).add(user.id));
      } else {
        setErrorIds((prev) => new Set(prev).add(user.id));
      }
      setActioningId(null);
    },
    [onSelect]
  );

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          inputMode="email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          aria-label={label}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-lg border border-border-strong bg-void px-3 py-2.5 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-signal/50 focus:outline-none focus:ring-1 focus:ring-signal/30 transition-colors disabled:opacity-50"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner />
          </span>
        )}
      </div>

      {open && !loading && searchError && (
        <p className="mt-1.5 text-xs text-ember" role="alert">
          {searchError}
        </p>
      )}

      {open && !loading && !searchError && searched && results.length === 0 && (
        <p className="mt-1.5 text-xs text-text-muted">
          No user found with that email or username.
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-border-strong bg-surface-raised shadow-lifted overflow-hidden">
          {results.map((user) => {
            const sent = sentIds.has(user.id);
            const errored = errorIds.has(user.id);
            const actioning = actioningId === user.id;
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => !sent && !actioning && handleSelect(user)}
                  disabled={disabled || sent || actioning}
                  className="w-full text-left px-3 py-2.5 hover:bg-elevated transition-colors flex items-center justify-between gap-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {climberDisplay(user.id, user.displayName, user.avatarId)}
                    </p>
                    <UsernameHandle username={user.username} />
                  </div>
                  <span
                    className={
                      "shrink-0 text-xs font-mono uppercase tracking-wider " +
                      (sent
                        ? "text-signal"
                        : errored
                          ? "text-ember"
                          : "text-signal")
                    }
                  >
                    {sent ? sentLabel : actioning ? "…" : errored ? "Retry" : actionLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
