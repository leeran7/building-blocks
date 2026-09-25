import { useCallback, useState } from "react";

export interface UseRetry {
  /** True from the tap until the refresh settles. */
  retrying: boolean;
  /** Settled attempts so far; changes once per finished retry. */
  attempts: number;
  /** Run one refresh; RetryPanel ignores taps while it is in flight. */
  retry: () => Promise<void>;
}

/**
 * Wraps a load-failure refresh so the screen can keep its error UI (and the
 * focused Try again button) mounted while the refresh runs. The cache clears
 * the slice's error the moment a cold refetch starts, so a screen that only
 * reads `error` would swap the error for its skeleton and drop focus.
 */
export function useRetry(refresh: () => Promise<void>): UseRetry {
  const [retrying, setRetrying] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
      setAttempts((n) => n + 1);
    }
  }, [refresh]);

  return { retrying, attempts, retry };
}
