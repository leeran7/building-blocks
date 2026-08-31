"use client";

/**
 * ShareRun — share a finished climb via X / TikTok / YouTube / copy link.
 * Consumes buildShareActions (saved recording) or token-only actions.
 */

import { useState } from "react";
import { Toast } from "../Toast";
import { buildShareActions, buildShareActionsFromTokenUrl } from "../../share/actions";
import { buildRecordingSharePayload } from "../../share/payload";
import { resolveBaseUrl } from "../../config/public";
import type { ShareableRecording } from "../../share/types";
import { ShareControls } from "./ShareControls";

export function ShareRun({
  peakY,
  recording,
  tokenUrl,
  encoding,
}: ShareRunProps) {
  const height = Math.round(peakY);
  const [toast, setToast] = useState<string | null>(null);

  const payloadResult = recording
    ? buildRecordingSharePayload(recording, resolveBaseUrl())
    : null;
  const actions = payloadResult?.ok
    ? buildShareActions(payloadResult.data)
    : tokenUrl
      ? buildShareActionsFromTokenUrl(tokenUrl, peakY)
      : [];

  return (
    <>
      <div className="mt-4 w-full max-w-sm rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 text-center">
        <div className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-1.5">
          Share your run
        </div>
        {encoding ? (
          <p className="text-xs text-text-muted font-mono">Preparing replay…</p>
        ) : actions.length > 0 ? (
          <>
            <p className="text-text-secondary text-xs leading-relaxed mb-3">
              Replay ready — share your{" "}
              <span className="text-signal font-mono tabular-nums">{height}m</span>{" "}
              climb
            </p>
            <ShareControls actions={actions} onToast={setToast} />
          </>
        ) : (
          <p className="text-xs text-text-muted leading-relaxed">
            This run was too long to share. Shorter climbs get a replay link
            automatically.
          </p>
        )}
      </div>

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}

interface ShareRunProps {
  peakY: number;
  recording: ShareableRecording | null;
  tokenUrl: string | null;
  encoding: boolean;
}
