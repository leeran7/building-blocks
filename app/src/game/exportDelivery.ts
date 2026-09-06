/**
 * Share-first vs download delivery for climb replay export (AC-SI-1…3).
 * Pure decision + delivery helper — unit-test without DOM / MediaRecorder.
 */

import type { ShareVideoResult } from "./shareVideoFile";

export type ExportDeliveryKind = "share" | "download";

export type ExportDeliveryChoice = {
  /** Invoke downloadBlob / `<a download>` when true. */
  download: boolean;
  /** Invoke shareVideoFile once on success when true. */
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

export type DeliverExportFileDeps = {
  canShare: (file: File) => boolean;
  share: (
    file: File,
    options: { title: string }
  ) => Promise<ShareVideoResult>;
  download: (file: File, filename: string) => void;
};

export type DeliverExportFileResult = {
  delivery: ExportDeliveryKind;
  /** Present when attemptShare ran. */
  shareResult?: ShareVideoResult;
};

/**
 * Apply share-first vs download after encode produces a File (AC-SI-1…3).
 * Call from the Export click async continuation after awaiting encode —
 * not from MediaRecorder.onstop alone (user-activation chain).
 */
export async function deliverExportFile(
  file: File,
  deps: DeliverExportFileDeps
): Promise<DeliverExportFileResult> {
  const choice = resolveExportDelivery(deps.canShare(file));
  if (choice.attemptShare) {
    const shareResult = await deps.share(file, { title: file.name });
    return { delivery: "share", shareResult };
  }
  if (choice.download) {
    deps.download(file, file.name);
  }
  return { delivery: "download" };
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
