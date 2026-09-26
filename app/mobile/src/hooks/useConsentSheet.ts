import { useCallback, useState } from "react";
import { CONSENT_SAVE_FAILED, useAcceptLeaderboardConsent } from "./useAcceptLeaderboardConsent";

export interface ConsentSheetCallbacks {
  /** Runs after the save is confirmed and the sheet has closed. */
  onSaved?: () => void | Promise<void>;
  /** Runs after the player declines and the sheet has closed. */
  onDeclined?: () => void;
}

export interface ConsentSheet {
  /** Whether the consent sheet is showing. */
  open: boolean;
  /** Opens the sheet. */
  show: () => void;
  /** A save is in flight: the sheet's buttons are disabled. */
  busy: boolean;
  /** Why the last save failed, shown in the sheet; null when there is nothing to say. */
  error: string | null;
  /** Saves consent. On failure the sheet stays open with CONSENT_SAVE_FAILED. */
  accept: () => Promise<void>;
  /** Closes the sheet without saving. */
  decline: () => void;
}

/**
 * The consent sheet's state machine, shared by Climb results and Ranks
 * (RV-DCF-3). Accept marks the sheet busy and clears the last error, then
 * saves through useAcceptLeaderboardConsent. A failed save keeps the sheet
 * open with CONSENT_SAVE_FAILED so the player can retry or decline. A
 * confirmed save closes it and then runs onSaved. Decline closes it, clears
 * the error and runs onDeclined. Screen-specific effects (posting the pending
 * run, marking a daily run not saved) belong in the callbacks.
 */
export function useConsentSheet({ onSaved, onDeclined }: ConsentSheetCallbacks = {}): ConsentSheet {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveConsent = useAcceptLeaderboardConsent();

  const show = useCallback(() => setOpen(true), []);

  const accept = useCallback(async () => {
    setBusy(true);
    setError(null);
    const saved = await saveConsent();
    if (!saved) {
      setError(CONSENT_SAVE_FAILED);
      setBusy(false);
      return;
    }
    setOpen(false);
    setBusy(false);
    await onSaved?.();
  }, [saveConsent, onSaved]);

  const decline = useCallback(() => {
    setOpen(false);
    setError(null);
    onDeclined?.();
  }, [onDeclined]);

  return { open, show, busy, error, accept, decline };
}
