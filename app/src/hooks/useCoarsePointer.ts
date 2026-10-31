"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const readCoarse = () => window.matchMedia(QUERY).matches;
/** The server can't know the pointer: hydration starts from mouse, then corrects. */
const serverSnapshot = () => false;

/**
 * True when the primary input is touch (phones, tablets).
 *
 * Read during render on the client, so a page reached by in-app navigation
 * paints its touch layout on the first frame. A flag set in an effect painted
 * the mouse layout first and then swapped it, which shrank the /climb controls
 * guide by 74px half a second after arriving on a phone.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, readCoarse, serverSnapshot);
}
