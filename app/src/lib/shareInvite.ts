"use client";

/**
 * Share a duel invite link — native share sheet FIRST, clipboard as fallback.
 *
 * The native sheet is the primary path everywhere it exists (not gated behind a
 * mobile user-agent test): it's the fastest way to get a link to a specific
 * person, and on desktop browsers that lack it we degrade to the clipboard.
 *
 * Dismissing the sheet is a deliberate user action, so it does NOT fall through
 * to copying — only a genuine failure does.
 */

export type InviteShareOutcome =
  /** Handed off to the OS share sheet. */
  | "shared"
  /** Written to the clipboard (or surfaced via prompt as a last resort). */
  | "copied"
  /** User dismissed the share sheet — nothing else to do. */
  | "dismissed"
  /** Nothing worked; the caller should show the raw link. */
  | "failed";

export interface ShareInviteOptions {
  title?: string;
  text?: string;
}

export async function shareInvite(
  url: string,
  opts: ShareInviteOptions = {}
): Promise<InviteShareOutcome> {
  const title = opts.title ?? "1v1 duel — Doomstack";
  const text = opts.text ?? "Race me to the top.";

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      // AbortError = the user closed the sheet on purpose; respect that and stop.
      if (err instanceof DOMException && err.name === "AbortError") return "dismissed";
      // Anything else (permission, unsupported payload) → fall through to copy.
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    // Clipboard blocked (insecure context / permissions) — fall through.
  }

  if (typeof window !== "undefined") {
    window.prompt("Copy this invite link:", url);
    return "copied";
  }
  return "failed";
}
