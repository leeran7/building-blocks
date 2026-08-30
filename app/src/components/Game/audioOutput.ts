"use client";

/**
 * iOS-safe audio output.
 *
 * A bare Web Audio graph on iOS plays on the *ringer* channel, so the hardware
 * Ring/Silent switch (and Silent Mode) mutes it even at full volume — which is
 * why game audio is silent on iPhone but fine on desktop. Routing the graph
 * through a MediaStreamAudioDestinationNode that feeds a `playsinline` <audio>
 * element moves playback to the *media* session, which ignores the switch, so
 * the game always plays.
 *
 * Browsers without MediaStream routing (or SSR) fall back to `ctx.destination`.
 * `prime()` must be called inside a user gesture: it resumes the context, starts
 * a one-sample silent buffer (iOS needs a real source started in the gesture,
 * not just `resume()`), and plays the media element.
 */

export interface AudioOutput {
  /** Connect your graph's final node into this. */
  readonly node: AudioNode;
  /** Call inside a user gesture (tap/click) to actually open output. */
  prime(): void;
  /** Release the media element / stream. Safe to call more than once. */
  dispose(): void;
}

/** iOS won't open output on `resume()` alone — it needs a source `start()`ed in
 *  the gesture. A one-sample silent buffer is the standard, inaudible kick. */
function kick(ctx: AudioContext): void {
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* best-effort */
  }
}

export function createAudioOutput(ctx: AudioContext): AudioOutput {
  // Only reroute on touch devices — that's where the ringer-switch problem is
  // (iOS). Desktop already plays fine through ctx.destination, so leave that
  // proven path untouched rather than risk a regression on it.
  const isTouch =
    typeof window !== "undefined" &&
    ((typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0));
  const canRoute =
    isTouch &&
    typeof document !== "undefined" &&
    typeof ctx.createMediaStreamDestination === "function";

  // Fallback: straight to the speakers (desktop, or no MediaStream support).
  if (!canRoute) {
    return {
      node: ctx.destination,
      prime() {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        kick(ctx);
      },
      dispose() {},
    };
  }

  const streamDest = ctx.createMediaStreamDestination();
  const el = document.createElement("audio");
  el.setAttribute("playsinline", ""); // typed only on <video>; valid on <audio> at runtime
  el.preload = "auto";
  // Hidden but attached — some iOS builds won't play a detached element.
  el.style.cssText =
    "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
  el.srcObject = streamDest.stream;
  document.body.appendChild(el);

  return {
    node: streamDest,
    prime() {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      kick(ctx);
      // The media element must be started in the gesture; retry is harmless.
      void el.play().catch(() => {});
    },
    dispose() {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
    },
  };
}
