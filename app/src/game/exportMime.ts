/**
 * MediaRecorder MIME negotiation for climb replay export.
 * Order is normative (architecture ADR): prefer H.264 MP4, then WebM.
 */

export type ExportMimeChoice = {
  mimeType: string;
  extension: "mp4" | "webm";
  label: "MP4" | "WebM";
};

/** Probe order — first supported wins. Silent video only (no audio codecs). */
export const EXPORT_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1.4D401E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function pickExportMime(
  isTypeSupported?: (mime: string) => boolean
): ExportMimeChoice | null {
  const probe = isTypeSupported ?? defaultIsTypeSupported;
  for (const mimeType of EXPORT_MIME_CANDIDATES) {
    let ok = false;
    try {
      ok = probe(mimeType);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    return choiceForMime(mimeType);
  }
  return null;
}

function choiceForMime(mimeType: string): ExportMimeChoice {
  if (mimeType.startsWith("video/mp4")) {
    return { mimeType, extension: "mp4", label: "MP4" };
  }
  return { mimeType, extension: "webm", label: "WebM" };
}

function defaultIsTypeSupported(mime: string): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  if (typeof MediaRecorder.isTypeSupported !== "function") return false;
  return MediaRecorder.isTypeSupported(mime);
}
