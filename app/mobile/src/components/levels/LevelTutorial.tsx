import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";
import {
  createTutorialDemo,
  isObstacleTopic,
  type TutorialDemo,
  type TutorialTopic,
} from "@app/game/levels/tutorial";
import { POWER_UP_SPECS } from "@app/game/powerups";
import { emptySample, sampleInterp, type RenderFrame } from "@app/game/renderFeed";
import { TICK_DT } from "@app/game/types";

import { Button } from "../ui";
import { tapLight } from "../../lib/haptics";

/**
 * The tutorial before a level: a short demo played by the game engine for
 * each topic (the basics before level 1, a new ladder obstacle or power-up
 * on the level that introduces it), with the step it shows captioned underneath.
 */
export function LevelTutorial({
  topics,
  onDone,
}: {
  topics: readonly TutorialTopic[];
  /** Closed: every demo watched, or skipped. */
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [replays, setReplays] = useState(0);
  const topic = topics[Math.min(index, topics.length - 1)];
  // A fresh demo per topic and per replay.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- replays: restart
  const demo = useMemo(() => createTutorialDemo(topic), [topic, replays]);
  const { stepIndex, done, feed } = useDemoPlayback(demo);
  const last = index >= topics.length - 1;
  const headingId = useId();

  const boxRef = useRef<HTMLDivElement>(null);
  const size = useBoxSize(boxRef);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const { info } = demo;
  const color = topic === "basics" || isObstacleTopic(topic) ? undefined : POWER_UP_SPECS[topic].color;
  const next = () => {
    if (last) onDone();
    else {
      setIndex((i) => i + 1);
      setReplays(0);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex flex-col bg-void pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]"
    >
      <div className="flex items-center justify-between px-5">
        <p className="font-mono text-label font-bold uppercase tracking-eyebrow text-signal">
          Tutorial{topics.length > 1 ? ` · ${index + 1} of ${topics.length}` : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            void tapLight();
            onDone();
          }}
          className="min-h-[44px] rounded-full px-4 font-mono text-label uppercase tracking-label text-text-secondary active:scale-95"
        >
          Skip
        </button>
      </div>

      <div
        ref={boxRef}
        aria-hidden
        className="relative mx-4 mt-2 min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10"
      >
        <ClimbCanvas
          state={demo.state}
          feed={feed}
          width={size.width}
          height={size.height}
          reducedMotion={reducedMotion}
          // Room under the climber, so the base and any lava below it show.
          bottomInset={Math.round(size.height * 0.22)}
          includeHud={false}
          fullBleed
        />
      </div>

      <div className="px-5 pt-4">
        <h2
          id={headingId}
          className="font-display text-title font-black uppercase leading-none tracking-tight text-text-primary"
          style={color ? { color } : undefined}
        >
          {info.heading}
        </h2>
        <ol className="mt-3 flex flex-col gap-2">
          {info.steps.map((s, i) => {
            const state = i < stepIndex || (done && i === stepIndex) ? "done" : i === stepIndex ? "now" : "next";
            return (
              <li
                key={s.title}
                aria-current={state === "now" ? "step" : undefined}
                className={`flex gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors ${
                  state === "now" ? "border-signal/50 bg-signal/10" : "border-white/10 bg-elevated/50"
                } ${state === "next" ? "opacity-50" : ""}`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                    state === "next" ? "border border-border-strong text-text-secondary" : "bg-signal text-void"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span>
                  <span className="block font-display text-meta font-black uppercase tracking-wide text-text-primary">
                    {s.title}
                  </span>
                  <span className="block text-meta text-text-secondary">{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex gap-2.5">
          {done && (
            <Button variant="secondary" onPress={() => setReplays((n) => n + 1)} className="flex-1">
              Watch again
            </Button>
          )}
          {/* Keyed per demo so focus lands on it for each one. */}
          <Button key={index} autoFocus onPress={next} className="flex-1">
            {last ? "Let’s climb" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Steps a demo at the engine's tick rate and hands the canvas each tick
 * through a render feed (interpolated like live play). React only hears
 * about caption changes.
 */
function useDemoPlayback(demo: TutorialDemo) {
  const [view, setView] = useState({ stepIndex: 0, done: false });
  const feed = useRef<RenderFrame | null>(null);

  useEffect(() => {
    const frame: RenderFrame = { state: demo.state, prev: null, stepTs: 0 };
    const prev = emptySample();
    feed.current = frame;
    setView({ stepIndex: demo.stepIndex, done: demo.done });
    let raf = 0;
    let lastTs = 0;
    let acc = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (demo.done) return;
      if (lastTs === 0) lastTs = ts;
      acc += Math.min(0.25, (ts - lastTs) / 1000);
      lastTs = ts;
      let advanced = false;
      while (acc >= TICK_DT && !demo.done) {
        acc -= TICK_DT;
        sampleInterp(demo.state, prev);
        demo.step();
        advanced = true;
      }
      if (!advanced) return;
      frame.prev = prev;
      frame.stepTs = ts - acc * 1000;
      setView((v) =>
        v.stepIndex === demo.stepIndex && v.done === demo.done ? v : { stepIndex: demo.stepIndex, done: demo.done },
      );
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [demo]);

  return { ...view, feed };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * The demo box's own size. The game's useCanvasSize sizes a full-screen
 * stage; the demo fills whatever room the captions leave.
 */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
