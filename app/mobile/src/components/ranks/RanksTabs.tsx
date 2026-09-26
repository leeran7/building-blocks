/**
 * The two Ranks tab rows (Global | Friends over Endless | Daily) and their
 * shared WAI-ARIA keyboard model. Split out of LeaderboardScreen (RV-DC-7).
 */
import type { KeyboardEvent } from "react";
import { tapLight } from "../../lib/haptics";
import { GlobeIcon, PeopleIcon } from "./icons";

export type Scope = "global" | "friends";
/**
 * Internal ids, kept stable for DOM ids and cache keys. "alltime" is the
 * Endless board (best free-stack height ever, which daily runs also raise);
 * "today" is the Daily Climb board, which resets at 00:00 UTC.
 */
export type Period = "today" | "alltime";

export const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "global", label: "Global" },
  { id: "friends", label: "Friends" },
];

/** Endless first and default; Daily opens from a tab or `?board=daily`. */
export const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "alltime", label: "Endless" },
  { id: "today", label: "Daily" },
];

export const PANEL_ID = "lb-panel";
export const PERIOD_PANEL_ID = "lb-period-panel";
export const tabId = (scope: Scope) => `lb-tab-${scope}`;
export const periodTabId = (period: Period) => `lb-period-${period}`;

interface TabsProps<T extends string> {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
  idFor: (id: T) => string;
  controls: string;
}

/**
 * WAI-ARIA tabs keyboard model shared by both tab rows: Left/Right move (and
 * wrap), Home/End jump to the ends, and focus follows the selection.
 */
function useTabKeys<T extends string>({ options, value, onChange, idFor }: TabsProps<T>) {
  const select = (next: T) => {
    if (next === value) return;
    void tapLight();
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.id === value);
    const target =
      e.key === "ArrowRight"
        ? (i + 1) % options.length
        : e.key === "ArrowLeft"
          ? (i + options.length - 1) % options.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? options.length - 1
              : null;
    if (target === null) return;
    e.preventDefault();
    const next = options[target].id;
    select(next);
    document.getElementById(idFor(next))?.focus();
  };

  return { select, onKeyDown };
}

/** Global | Friends: the screen's primary control, a lime pill segmented tablist. */
export function ScopeTabs({ scope, onChange }: { scope: Scope; onChange: (next: Scope) => void }) {
  const props: TabsProps<Scope> = {
    options: SCOPES,
    value: scope,
    onChange,
    label: "Leaderboard scope",
    idFor: tabId,
    controls: PANEL_ID,
  };
  const { select, onKeyDown } = useTabKeys(props);
  return (
    <div
      role="tablist"
      aria-label={props.label}
      onKeyDown={onKeyDown}
      className="glass mb-3 grid grid-cols-2 gap-1 rounded-full border border-white/10 p-1"
    >
      {SCOPES.map(({ id, label }) => {
        const selected = id === scope;
        return (
          <button
            key={id}
            id={tabId(id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(id)}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-full font-display text-meta font-black uppercase tracking-chip transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
              selected
                ? "bg-signal text-void shadow-[0_0_18px_-4px_rgba(203,242,77,0.6)]"
                : "text-text-secondary active:bg-white/5"
            }`}
          >
            {id === "global" ? <GlobeIcon /> : <PeopleIcon />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Endless | Daily: a light, centred underline tab row under the scope pill,
 * in sentence case body type (not tracked mono caps) so it reads as a
 * secondary control under the Global | Friends pill.
 * Selected = accent text over an accent bar; unselected = secondary text.
 */
export function PeriodTabs({ period, onChange }: { period: Period; onChange: (next: Period) => void }) {
  const props: TabsProps<Period> = {
    options: PERIODS,
    value: period,
    onChange,
    label: "Leaderboard mode",
    idFor: periodTabId,
    controls: PERIOD_PANEL_ID,
  };
  const { select, onKeyDown } = useTabKeys(props);
  return (
    <div role="tablist" aria-label={props.label} onKeyDown={onKeyDown} className="mb-4 flex justify-center gap-6">
      {PERIODS.map(({ id, label }) => {
        const selected = id === period;
        return (
          <button
            key={id}
            id={periodTabId(id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PERIOD_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(id)}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 rounded-md px-2 font-sans text-body font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
              selected ? "text-accent" : "text-text-secondary active:text-text-primary"
            }`}
          >
            {label}
            <span aria-hidden className={`h-0.5 w-full rounded-full ${selected ? "bg-accent" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}
