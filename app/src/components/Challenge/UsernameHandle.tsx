/** Web /duel's size for the handle line: one step under its text-sm names. */
const WEB_HANDLE_SIZE = "text-xs";

interface UsernameHandleProps {
  /** Public handle to show under a resolved name; renders nothing when absent. */
  username: string | null | undefined;
  /**
   * Font-size utility for the line. Web keeps the default. The mobile tree
   * passes its own type token (text-meta), because its names are larger.
   */
  sizeClass?: string;
}

/**
 * The "@handle" line shown under a friend/challenge row's resolved name
 * (see climberDisplay) whenever the person has a username set. Shared by
 * both the web (`components/Challenge`) and mobile (`mobile/.../challenge`,
 * via the `@app/*` alias) challenge-screen trees so the two never drift.
 */
export function UsernameHandle({ username, sizeClass = WEB_HANDLE_SIZE }: UsernameHandleProps) {
  if (!username) return null;
  return <p className={`truncate ${sizeClass} text-text-muted`}>@{username}</p>;
}
