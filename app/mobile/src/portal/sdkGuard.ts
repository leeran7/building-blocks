/**
 * Helpers for calling a host SDK that may be missing, blocked by an ad
 * blocker, half-loaded or buggy. The game must keep running whatever the SDK
 * does, so nothing here throws and nothing waits forever.
 */

/** Run `fn`; on any throw return `fallback` instead. */
export function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export type Settled<T> = { ok: true; value: T } | { ok: false; reason: "timeout" | "error" };

/**
 * Settle `run()` within `ms`. A synchronous throw, a rejection and a timeout
 * all come back as `{ ok: false }`; this never rejects.
 */
export function settleWithin<T>(run: () => T | PromiseLike<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), ms);
    Promise.resolve()
      .then(run)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve({ ok: true, value });
        },
        () => {
          clearTimeout(timer);
          resolve({ ok: false, reason: "error" });
        },
      );
  });
}

/**
 * Append `<script src>` and resolve true once it has loaded, false on an
 * error or after `timeoutMs` (an ad blocker can leave the request hanging).
 */
export function loadScript(doc: Document, src: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(false), timeoutMs);
    function finish(ok: boolean): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    }
    try {
      const el = doc.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => finish(true);
      el.onerror = () => finish(false);
      doc.head.appendChild(el);
    } catch {
      finish(false);
    }
  });
}
