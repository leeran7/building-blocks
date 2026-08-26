"use client";

/**
 * TowerView — Virtualized tower renderer (AC-22).
 *
 * CRITICAL:
 * - Only ~60 rows in DOM around viewport (AC-22)
 * - Polls GET /api/tower every 10s (AC-41)
 * - FLIP animation on rank change (AC-42, AC-45)
 * - prefers-reduced-motion → cross-fade (AC-43)
 * - Renders as <a> elements, not canvas (AC-21)
 * - CSS keyframe sway only, no physics library (AC-29)
 * - Keyboard accessible (AC-23)
 */

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { BlockRow } from "./BlockRow";
import { GroundRow } from "./GroundRow";
import { TowerHeader } from "./TowerHeader";
import { PUBLIC_CONFIG } from "../../config/public";

const POLL_INTERVAL_MS = PUBLIC_CONFIG.pollIntervalMs;
const VISIBLE_ROWS = 60;
const ROW_HEIGHT = 60; // min-h-[56px] row + 4px stack gap

export interface TowerBlock {
  id: string;
  slug: string;
  url: string;
  display_name: string;
  altitude: number;
  spend_c: number;
  views_served: number;
  clicks: number;
  peak_rank: number | null;
  hidden_at: string | null;
  created_at: string;
  buried: boolean;
  amber_edge: boolean;
  rank: number;
}

export interface TowerData {
  season: {
    id: string;
    views_k: number;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
  };
  engine: {
    growth: number;
    rate: number;
    ground: number;
  };
  blocks: TowerBlock[];
  cost_of_rank1_usd: number;
}

interface TowerViewProps {
  initialData: TowerData;
  pollUrl?: string; // defaults to /api/tower; category pages pass /api/tower/[category]
}

export function TowerView({ initialData, pollUrl = "/api/tower" }: TowerViewProps) {
  const [data, setData] = useState<TowerData>(initialData);
  const [prevRanks, setPrevRanks] = useState<Map<string, number>>(new Map());
  const [changedBlocks, setChangedBlocks] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  // Refs to listitem wrapper divs keyed by block id — used for FLIP (AC-45)
  const blockRefsRef = useRef<Map<string, HTMLElement>>(new Map());
  // Carries position snapshot + changed-id set from poll() into useLayoutEffect
  const flipStateRef = useRef<{
    changedIds: Set<string>;
    beforePositions: Map<string, DOMRect>;
  } | null>(null);
  // Stable ref for prefers-reduced-motion so poll() doesn't need it as a dep
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    prefersReducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  // Virtualization
  const totalBlocks = data.blocks.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10);
  const endIndex = Math.min(totalBlocks, startIndex + VISIBLE_ROWS + 20);
  const visibleBlocks = data.blocks.slice(startIndex, endIndex);

  const ground = data.engine.ground;
  const groundIndex = data.blocks.findIndex((b) => b.altitude < ground);
  // Blocks are sorted by altitude DESC, so [0] is the stack max — scales the bars.
  const maxAltitude = data.blocks[0]?.altitude ?? 0;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Poll for updates (AC-41 — interval <= 10s)
  const poll = useCallback(async () => {
    try {
      const res = await fetch(pollUrl);
      if (!res.ok) return;
      const newData: TowerData = await res.json();

      const newRankMap = new Map<string, number>();
      newData.blocks.forEach((b) => newRankMap.set(b.id, b.rank));

      const changed = new Set<string>();
      newRankMap.forEach((newRank, id) => {
        const oldRank = prevRanks.get(id);
        if (oldRank !== undefined && oldRank !== newRank) {
          changed.add(id);
        }
      });

      if (changed.size > 0 && !prefersReducedMotionRef.current) {
        // FLIP — First: capture positions before React re-renders (AC-45)
        const beforePositions = new Map<string, DOMRect>();
        blockRefsRef.current.forEach((el, id) => {
          beforePositions.set(id, el.getBoundingClientRect());
        });
        flipStateRef.current = { changedIds: changed, beforePositions };

        setChangedBlocks(changed);
        // Clear slide-in flag after animation (~1.4s, slightly more than 1.2s)
        setTimeout(() => setChangedBlocks(new Set()), 1400);
      }

      setPrevRanks(newRankMap);
      setData(newData);
    } catch {
      // Network error — silent fail, will retry on next poll
    }
  }, [prevRanks, pollUrl]);

  // FLIP — Last + Invert + Play: runs synchronously after DOM update (AC-42, AC-45)
  useLayoutEffect(() => {
    if (!flipStateRef.current) return;
    const { changedIds, beforePositions } = flipStateRef.current;
    flipStateRef.current = null;

    if (prefersReducedMotionRef.current) return;

    // Collect intermediate blocks (not the moved block) with non-zero displacement
    const toAnimate: Array<{ el: HTMLElement; deltaY: number }> = [];

    blockRefsRef.current.forEach((el, id) => {
      if (changedIds.has(id)) return; // changed block gets CSS slide-in via state
      const before = beforePositions.get(id);
      if (!before) return;
      // Last: read position after DOM update
      const after = el.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 1) return;
      toAnimate.push({ el, deltaY });
    });

    if (toAnimate.length === 0) return;

    // Sort by smallest displacement first for stagger (closest blocks animate first)
    toAnimate.sort((a, b) => Math.abs(a.deltaY) - Math.abs(b.deltaY));

    // Invert: apply all inverse transforms before any reflow
    toAnimate.forEach(({ el, deltaY }) => {
      el.style.transform = `translateY(${deltaY}px)`;
      el.style.transition = "none";
    });

    // Single forced reflow to commit inverse transforms before transition starts
    void toAnimate[0].el.offsetHeight;

    // Play: animate to identity with ~30ms inter-block stagger (AC-42)
    toAnimate.forEach(({ el }, i) => {
      el.style.transition = `transform 0.5s cubic-bezier(0.2, 0, 0.1, 1) ${i * 30}ms`;
      el.style.transform = "translateY(0)";
    });

    // Clean up inline styles after animation finishes
    const totalMs = toAnimate.length * 30 + 520;
    setTimeout(() => {
      toAnimate.forEach(({ el }) => {
        el.style.transform = "";
        el.style.transition = "";
      });
    }, totalMs);
  }, [data]);

  // Initialize rank map from initial data
  useEffect(() => {
    const rankMap = new Map<string, number>();
    initialData.blocks.forEach((b) => rankMap.set(b.id, b.rank));
    setPrevRanks(rankMap);
  }, [initialData]);

  // Polite polling (scale): only poll while the tab is VISIBLE, and jitter the
  // interval so 10k clients don't stampede the origin in lockstep. A hidden tab
  // stops polling entirely (and refreshes once on return).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      // Jitter DOWN only (80–100% of base) to de-sync clients while never
      // exceeding the 10s poll cap (AC-41).
      const jitter = POLL_INTERVAL_MS * (0.8 + Math.random() * 0.2);
      timer = setTimeout(tick, jitter);
    };
    const tick = () => {
      if (!document.hidden) poll();
      schedule();
    };
    const onVisibility = () => {
      if (!document.hidden) poll(); // catch up immediately on return
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  const { rate, growth } = data.engine;
  const { views_k } = data.season;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="tower-view">
      <TowerHeader
        cost_of_rank1_usd={data.cost_of_rank1_usd}
        views_k={views_k}
        rate={rate}
        growth={growth}
        ground={ground}
      />

      {/* Virtualized scroll container (AC-22) */}
      <div
        ref={containerRef}
        className="topo flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={handleScroll}
        style={{ WebkitOverflowScrolling: "touch" }}
        data-testid="tower-scroll"
        aria-label="Tower listing — ranked by altitude"
        role="list"
      >
        {/* Top spacer for virtualization */}
        <div style={{ height: startIndex * ROW_HEIGHT }} aria-hidden="true" />

        <div className="max-w-2xl mx-auto px-3 space-y-1.5 pt-3">
          {visibleBlocks.map((block, localIndex) => {
            const absoluteIndex = startIndex + localIndex;
            const showGroundBefore =
              groundIndex >= 0 &&
              absoluteIndex === groundIndex &&
              ground > 0;

            return (
              <React.Fragment key={block.id}>
                {showGroundBefore && (
                  <GroundRow ground={ground} views_k={views_k} />
                )}
                {/* Wrapper div is the FLIP target — ref keyed by block id */}
                <div
                  role="listitem"
                  ref={(el) => {
                    if (el) blockRefsRef.current.set(block.id, el);
                    else blockRefsRef.current.delete(block.id);
                  }}
                >
                  <BlockRow
                    id={block.id}
                    slug={block.slug}
                    url={block.url}
                    display_name={block.display_name}
                    altitude={block.altitude}
                    rank={block.rank}
                    buried={block.buried}
                    amber_edge={block.amber_edge}
                    views_served={block.views_served}
                    maxAltitude={maxAltitude}
                    rankChanged={changedBlocks.has(block.id)}
                  />
                </div>
              </React.Fragment>
            );
          })}

          {groundIndex < 0 && ground > 0 && (
            <GroundRow ground={ground} views_k={views_k} />
          )}

          {groundIndex >= 0 && (
            <div
              className="mt-2 rounded-lg border border-ember/20 bg-ember/[0.04] py-6 text-center font-mono text-ember/70 text-[11px] uppercase tracking-[0.2em]"
              aria-label="Underground — buried blocks are below ground level"
            >
              ▼ underground · buried blocks
            </div>
          )}
        </div>

        {/* Bottom spacer for virtualization */}
        <div
          style={{ height: Math.max(0, (totalBlocks - endIndex) * ROW_HEIGHT) }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
