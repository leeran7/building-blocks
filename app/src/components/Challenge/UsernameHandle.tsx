interface UsernameHandleProps {
  /** Public handle to show under a resolved name; renders nothing when absent. */
  username: string | null | undefined;
}

/**
 * The "@handle" line shown under a friend/challenge row's resolved name
 * (see climberDisplay) whenever the person has a username set. Shared by
 * both the web (`components/Challenge`) and mobile (`mobile/.../challenge`,
 * via the `@app/*` alias) challenge-screen trees so the two never drift.
 */
export function UsernameHandle({ username }: UsernameHandleProps) {
  if (!username) return null;
  return <p className="truncate text-sm text-text-muted">@{username}</p>;
}
