import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export interface UseRetryOptions {
  /** The slice's cold load failed (the cache sets this only while it has no data). */
  failed: boolean;
  /** The slice has data to show. */
  hasData: boolean;
  /**
   * Gets focus when content replaces the error panel and the panel took focus
   * with it (usually the screen's heading, with tabIndex={-1}).
   */
  focusOnRecover: RefObject<HTMLElement | null>;
}

export interface UseRetry {
  /** Render RetryPanel instead of the screen: failed, or retrying with no data yet. */
  showError: boolean;
  /** True from the tap until the refresh settles. */
  retrying: boolean;
  /** Settled attempts so far; changes once per finished retry. */
  attempts: number;
  /** Run one refresh; RetryPanel ignores taps while it is in flight. */
  retry: () => Promise<void>;
}

/** Focus went with a removed node (or nothing had it), so the browser parked it on <body>. */
function focusWasLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

/**
 * Wraps a load-failure refresh so the screen can keep its error UI (and the
 * focused Try again button) mounted while the refresh runs. The cache clears
 * the slice's error the moment a cold refetch starts, so a screen that only
 * reads `error` would swap the error for its skeleton and drop focus.
 *
 * When the error does give way to content, the panel's button unmounts and
 * the browser drops focus to <body>. The layout effect below catches that
 * before paint and moves focus to `focusOnRecover`, so keyboard and screen
 * reader users land on the screen that just loaded. Focus that is somewhere
 * real (Back, a tab) is left alone.
 */
export function useRetry(refresh: () => Promise<void>, options: UseRetryOptions): UseRetry {
  const { failed, hasData, focusOnRecover } = options;
  const [retrying, setRetrying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const showError = !hasData && (failed || retrying);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
      setAttempts((n) => n + 1);
    }
  }, [refresh]);

  const wasShowingError = useRef(showError);
  useLayoutEffect(() => {
    const recovered = wasShowingError.current && !showError;
    wasShowingError.current = showError;
    if (recovered && focusWasLost()) focusOnRecover.current?.focus();
  }, [showError, focusOnRecover]);

  return { showError, retrying, attempts, retry };
}
