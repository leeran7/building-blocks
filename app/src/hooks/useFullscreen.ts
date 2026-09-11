"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export interface FullscreenApi {
  /** True while the tracked element (or a descendant) owns the fullscreen. */
  isFullscreen: boolean;
  /** False when the browser has no Fullscreen API (or it's blocked). */
  supported: boolean;
  toggle: () => void;
  enter: () => void;
  exit: () => void;
}

// Safari (incl. iOS) still ships the API only under the webkit-prefixed names.
interface WebkitFullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}
interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}

function fullscreenElement(): Element | null {
  const doc = document as WebkitFullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Native Fullscreen API bound to a specific element (the game stage). Tracks
 * enter/exit from any source — the button, the Esc key, the browser chrome —
 * so the button label and stage layout stay in sync. `supported` is false on
 * browsers without the API so callers can hide the affordance.
 */
export function useFullscreen(
  ref: RefObject<HTMLElement | null>
): FullscreenApi {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const doc = document as WebkitFullscreenDocument;
    setSupported(
      Boolean(document.fullscreenEnabled ?? doc.webkitFullscreenEnabled)
    );
    const sync = () => setIsFullscreen(fullscreenElement() === ref.current);
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [ref]);

  const enter = useCallback(() => {
    const el = ref.current as WebkitFullscreenElement | null;
    if (!el) return;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    // requestFullscreen rejects if not triggered by a user gesture / disallowed
    // embed. The button click that calls this is a gesture, so swallow the
    // rejection rather than surfacing an unhandled promise error (the webkit
    // variant returns void, hence the optional-chained catch).
    void request?.call(el)?.catch?.(() => {});
  }, [ref]);

  const exit = useCallback(() => {
    const doc = document as WebkitFullscreenDocument;
    const request = document.exitFullscreen ?? doc.webkitExitFullscreen;
    void request?.call(document)?.catch?.(() => {});
  }, []);

  const toggle = useCallback(() => {
    if (fullscreenElement()) exit();
    else enter();
  }, [enter, exit]);

  return { isFullscreen, supported, toggle, enter, exit };
}
