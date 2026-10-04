/**
 * The Sound switch on mobile Settings and the in-run mute share one saved
 * flag. Settings writes it through sfxMute; this proves runs read it, so the
 * switch actually silences the next run.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePowerUpFeedback } from "@app/components/Game/usePowerUpFeedback";
import { isSfxMuted, setSfxMuted } from "@app/components/Game/sfxMute";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let feedback: ReturnType<typeof usePowerUpFeedback> | null = null;

function Probe({ report }: { report: (f: ReturnType<typeof usePowerUpFeedback>) => void }) {
  report(usePowerUpFeedback(undefined, 0, 0));
  return null;
}

const probe = () =>
  createElement(Probe, {
    report: (f) => {
      feedback = f;
    },
  });

beforeEach(() => {
  localStorage.clear();
  feedback = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the saved sound preference", () => {
  it("starts a run muted when Settings turned sound off", () => {
    setSfxMuted(true);
    act(() => root.render(probe()));
    expect(feedback?.muted).toBe(true);
  });

  it("starts a run with sound when Settings turned it back on", () => {
    setSfxMuted(true);
    setSfxMuted(false);
    act(() => root.render(probe()));
    expect(feedback?.muted).toBe(false);
  });

  it("is what Settings reads after a run's mute button", () => {
    act(() => root.render(probe()));
    act(() => feedback?.setMuted(true));
    expect(isSfxMuted()).toBe(true);
  });
});
