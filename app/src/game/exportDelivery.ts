/**
 * Share-first vs download delivery for climb replay export (AC-SI-1…3).
 * Pure decision — invoke from MediaRecorder.onstop; unit-test without DOM.
 */

export type ExportDeliveryKind = "share" | "download";

export type ExportDeliveryChoice = {
  /** Invoke downloadBlob / `<a download>` when true. */
  download: boolean;
  /** Invoke shareVideoFile once on success when true (may lack user activation). */
  attemptShare: boolean;
  delivery: ExportDeliveryKind;
};

/**
 * Choose export delivery from a canShare probe result.
 * When shareable: skip download, attempt native share, keep Share for retry.
 * When not: keep download fallback (desktop / unsupported UA).
 */
export function resolveExportDelivery(canShare: boolean): ExportDeliveryChoice {
  if (canShare) {
    return { download: false, attemptShare: true, delivery: "share" };
  }
  return { download: true, attemptShare: false, delivery: "download" };
}

/**
 * Success chrome / aria-live copy for encode complete (AC-SI-4 related).
 * Prefer delivery from status; fall back to live canShare when delivery omitted.
 */
export function exportSuccessLabel(
  label: "MP4" | "WebM",
  delivery: ExportDeliveryKind | undefined,
  canShare: boolean
): string {
  const shareFirst =
    delivery === "share" || (delivery !== "download" && canShare);
  return shareFirst ? `Ready to share ${label}` : `Downloaded ${label}`;
}
