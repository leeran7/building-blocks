"use client";

/**
 * RankAnimation — Standalone loopable rank-change preview (AC-44).
 *
 * Demonstrates the FLIP animation without live data so it can be
 * screen-recorded or inspected on any record page.
 *
 * Cycle: every 3s a block tops up and jumps to rank #1.
 * The displaced blocks shift down with 30ms stagger (FLIP).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatAltitude } from "../../lib/units";

interface DemoBlock {
  id: string;
  name: string;
  altitude: number;
}

const STATES: DemoBlock[][] = [
  // initial order
  [
    { id: "b1", name: "ProductHunt Daily", altitude: 520 },
    { id: "b2", name: "HackerNews Post", altitude: 465 },
    { id: "b3", name: "DevBlog.io", altitude: 400 },
    { id: "b4", name: "YourProject.com", altitude: 340 },
    { id: "b5", name: "CoolSite.net", altitude: 275 },
  ],
  // after top-up: b4 jumps to #1
  [
    { id: "b4", name: "YourProject.com", altitude: 540 },
    { id: "b1", name: "ProductHunt Daily", altitude: 520 },
    { id: "b2", name: "HackerNews Post", altitude: 465 },
    { id: "b3", name: "DevBlog.io", altitude: 400 },
    { id: "b5", name: "CoolSite.net", altitude: 275 },
  ],
];

const CYCLE_MS = 3200;
const CHANGED_ID = "b4";

export function RankAnimation() {
  const [stateIndex, setStateIndex] = useState(0);
  const [blocks, setBlocks] = useState<DemoBlock[]>(STATES[0]);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Refs for FLIP
  const rowRefsRef = useRef<Map<string, HTMLElement>>(new Map());
  const beforePositionsRef = useRef<Map<string, DOMRect>>(new Map());
  const pendingFlipRef = useRef(false);

  // Cycle to next state
  useEffect(() => {
    const t = setTimeout(() => {
      // First: capture current positions before state update
      const before = new Map<string, DOMRect>();
      rowRefsRef.current.forEach((el, id) => {
        before.set(id, el.getBoundingClientRect());
      });
      beforePositionsRef.current = before;
      pendingFlipRef.current = true;

      const next = (stateIndex + 1) % STATES.length;
      setStateIndex(next);
      setBlocks(STATES[next]);
      setHighlightId(CHANGED_ID);
      setTimeout(() => setHighlightId(null), 1400);
    }, CYCLE_MS);

    return () => clearTimeout(t);
  }, [stateIndex]);

  // Last + Invert + Play — runs after DOM update, before paint (AC-45)
  useLayoutEffect(() => {
    if (!pendingFlipRef.current) return;
    pendingFlipRef.current = false;

    const before = beforePositionsRef.current;
    const toAnimate: Array<{ el: HTMLElement; deltaY: number }> = [];

    rowRefsRef.current.forEach((el, id) => {
      if (id === CHANGED_ID) return;
      const b = before.get(id);
      if (!b) return;
      const after = el.getBoundingClientRect();
      const deltaY = b.top - after.top;
      if (Math.abs(deltaY) < 1) return;
      toAnimate.push({ el, deltaY });
    });

    if (toAnimate.length === 0) return;

    // Sort by smallest displacement for natural stagger ordering
    toAnimate.sort((a, b) => Math.abs(a.deltaY) - Math.abs(b.deltaY));

    // Invert: apply all inverse transforms without triggering layout
    toAnimate.forEach(({ el, deltaY }) => {
      el.style.transform = `translateY(${deltaY}px)`;
      el.style.transition = "none";
    });

    // Single reflow
    void toAnimate[0].el.offsetHeight;

    // Play: animate to identity with ~30ms stagger (AC-42)
    toAnimate.forEach(({ el }, i) => {
      el.style.transition = `transform 0.5s cubic-bezier(0.2, 0, 0.1, 1) ${i * 30}ms`;
      el.style.transform = "translateY(0)";
    });

    const cleanupMs = toAnimate.length * 30 + 520;
    setTimeout(() => {
      toAnimate.forEach(({ el }) => {
        el.style.transform = "";
        el.style.transition = "";
      });
    }, cleanupMs);
  }, [blocks]);

  return (
    <div className="border border-border-subtle rounded-xl p-4 bg-surface mt-6">
      <h3 className="text-text-muted text-[10px] uppercase tracking-[0.12em] mb-3">
        Live rank animation preview
      </h3>

      <div className="space-y-1.5">
        {blocks.map((block, i) => {
          const highlighted = highlightId === block.id;
          return (
            <div
              key={block.id}
              ref={(el) => {
                if (el) rowRefsRef.current.set(block.id, el);
                else rowRefsRef.current.delete(block.id);
              }}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg border text-sm",
                highlighted
                  ? "border-accent/50 bg-accent/[0.06] block-slide-in"
                  : "border-border-subtle",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={[
                  "font-mono w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0",
                  highlighted ? "bg-accent text-void" : "border border-border-strong text-text-secondary",
                ].join(" ")}
              >
                {i + 1}
              </span>
              <span
                className={`flex-1 truncate font-medium ${
                  highlighted ? "text-accent" : "text-text-primary"
                }`}
              >
                {block.name}
              </span>
              <span className="text-text-muted font-mono text-xs flex-shrink-0 tabular-nums">
                {formatAltitude(block.altitude, 1)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-text-muted text-xs mt-3 text-center">
        Rank updates in real time as payments complete
      </p>
    </div>
  );
}
