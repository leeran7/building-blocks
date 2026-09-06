/**
 * Web Share API Level 2 (files) for climb replay export.
 * Injectable canShare/share seams for unit tests — never polyfill.
 */

export type ShareVideoDeps = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

export type ShareVideoOptions = {
  title?: string;
  text?: string;
  /** Test / SSR seam — defaults to navigator.* when available */
  deps?: ShareVideoDeps;
};

export type ShareVideoResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" }
  | { ok: false; reason: "aborted" }
  | { ok: false; reason: "error"; message: string };

const SHARE_FAILED_MSG = "Share failed";

/**
 * Files-only probe. Missing/throwing canShare → false.
 * Must not include title/text in the probe payload (ADR-NS-3).
 */
export function canShareVideoFile(
  file: File,
  deps?: ShareVideoDeps
): boolean {
  const canShare = deps?.canShare ?? defaultCanShare;
  if (!canShare) return false;
  try {
    return canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Must be called from a user-gesture handler.
 * Payload always includes files: [file]. Optional title/text are share()-only
 * and MUST NOT be included in the canShare probe.
 */
export async function shareVideoFile(
  file: File,
  options?: ShareVideoOptions
): Promise<ShareVideoResult> {
  const deps = options?.deps;
  if (!canShareVideoFile(file, deps)) {
    return { ok: false, reason: "unsupported" };
  }

  const share = deps?.share ?? defaultShare;
  if (!share) {
    return { ok: false, reason: "unsupported" };
  }

  const data: ShareData = { files: [file] };
  if (options?.title !== undefined) data.title = options.title;
  if (options?.text !== undefined) data.text = options.text;

  try {
    await share(data);
    return { ok: true };
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, reason: "aborted" };
    }
    const message =
      err instanceof Error && err.message.trim().length > 0
        ? err.message
        : SHARE_FAILED_MSG;
    return { ok: false, reason: "error", message };
  }
}

function defaultCanShare(data: ShareData): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.canShare !== "function") return false;
  return navigator.canShare(data);
}

function defaultShare(data: ShareData): Promise<void> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return Promise.reject(new Error(SHARE_FAILED_MSG));
  }
  return navigator.share(data);
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
}
