"use client";

import { useEffect } from "react";

/**
 * Locks page scroll while `locked` is true — used by the game stages so a run
 * can't be scrolled mid-play (Space/arrows or a stray wheel tick moving the
 * page under the canvas). Restores the prior inline overflow on unlock, so a
 * scene that unlocks in its lobby/results phase leaves the surrounding page
 * (how-to card, About copy, footer) scrollable again.
 *
 * Toggles overflow on <html> and <body> both: some browsers honour only one.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const doc = document.documentElement;
    const { body } = document;
    const prevDocOverflow = doc.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    doc.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      doc.style.overflow = prevDocOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [locked]);
}
