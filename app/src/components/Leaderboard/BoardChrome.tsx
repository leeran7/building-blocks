/**
 * The frame both leaderboards share: /climb (Solo) and /duel/leaderboard (1v1).
 *
 * The Solo | 1v1 switch crosses between the two pages, so everything around
 * the rows is the same component on both: the intro block, the switch, the
 * board column with the standing panel beside it. Switching then only swaps
 * the words and the rows; the switch itself, the panel and the top of the
 * board stay where they were.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { CLIMB_PANEL_INTRO_TITLE_CLASS } from "../../design/climbFeelTokens";
import { DUEL_LEADERBOARD_HREF } from "../navLinks";

/**
 * Eyebrow, title and one description paragraph. Keep the two pages'
 * descriptions about the same length: they wrap to the same number of lines,
 * so the switch under them doesn't move.
 */
export function BoardIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header>
      <p
        className="climb-reveal font-mono text-xs uppercase tracking-[0.2em] font-medium text-signal"
        style={{ animationDelay: "0ms" }}
      >
        {eyebrow}
      </p>
      <div className="climb-reveal mt-1" style={{ animationDelay: "70ms" }}>
        <h1 className={CLIMB_PANEL_INTRO_TITLE_CLASS}>{title}</h1>
      </div>
      <p
        className="climb-reveal mt-3 text-sm text-text-secondary max-w-lg"
        style={{ animationDelay: "140ms" }}
      >
        {children}
      </p>
    </header>
  );
}

export type BoardScope = "solo" | "1v1";

/** Which board you are looking at; each is its own page. */
export function BoardScopeNav({ current }: { current: BoardScope }) {
  return (
    <nav aria-label="Leaderboards" className="flex flex-wrap gap-2">
      <ScopeLink href="/climb" label="Endless" current={current === "solo"} />
      <ScopeLink href={DUEL_LEADERBOARD_HREF} label="1v1" current={current === "1v1"} />
    </nav>
  );
}

function ScopeLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        "inline-flex min-h-[44px] items-center rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (current
          ? "border-signal/60 bg-signal/10 text-signal"
          : "border-border-strong bg-surface text-text-secondary hover:border-signal/40 hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}

/**
 * The switch, then the board column with the standing panel beside it (on top
 * of it on small screens, so they lead with the viewer's own standing).
 */
export function BoardLayout({
  scope,
  panel,
  children,
}: {
  scope: BoardScope;
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-6">
      <BoardScopeNav current={scope} />
      {/* grid-cols-1 (a minmax(0, 1fr) track), not the implicit auto track:
          an auto track grows to the panel's widest line and pushed a 320px
          phone into sideways scrolling. */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">{panel}</div>
        <div className="lg:col-start-1 lg:row-start-1">{children}</div>
      </div>
    </div>
  );
}

/** The search row above the rows; it only narrows rows already on the page. */
export function BoardSearch({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Extra controls on the same row (the Solo board's "Find me"). */
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className="w-full rounded-lg border border-border-strong bg-surface px-3 min-h-[44px] text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        />
      </div>
      {children}
    </div>
  );
}

/**
 * Jumps to the viewer's own row. Clears the search first, so the row is
 * mounted when the scroll runs.
 */
export function BoardFindMe({ rowId, onClearSearch }: { rowId: string; onClearSearch: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onClearSearch();
        requestAnimationFrame(() => {
          document.getElementById(rowId)?.scrollIntoView({ block: "center" });
        });
      }}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-signal/40 px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-signal transition-colors hover:bg-signal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
    >
      Find me
    </button>
  );
}

/** "No row matches" with a way back to the full board. */
export function BoardNoMatch({ query, noun, onClear }: { query: string; noun: string; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-border-strong bg-surface p-8 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
        [ no match ]
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        No {noun} matches &ldquo;{query}&rdquo;.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-border-strong px-5 text-sm font-medium text-text-primary transition-colors hover:border-signal/50"
      >
        Clear search
      </button>
    </div>
  );
}

/** The board page's one primary action, full width under the standing. */
export function BoardCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center rounded-full bg-signal text-void font-semibold px-6 min-h-[44px] shadow-signal hover:brightness-110 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void active:scale-[0.98] motion-reduce:active:scale-100 transition-[filter,transform,scale] whitespace-nowrap"
    >
      {children}
    </Link>
  );
}

export interface StandingStat {
  label: string;
  tone: "signal" | "secondary";
}

/**
 * The viewer's own standing plus the page's one primary action.
 *
 * Signed in, the panel is always the height of a full record: while the read
 * is in flight the record's layout shows dashes, and a message (no record yet,
 * read failed) sits over an invisible copy of that layout. The panel sits
 * above the board on a phone, so a panel that changed height when the read
 * landed would move the whole board.
 */
export function StandingPanel({
  label,
  signedIn,
  pending = false,
  unit,
  stats,
  record,
  message,
  cta,
}: {
  label: string;
  signedIn: boolean;
  /** A signed-in read is in flight. */
  pending?: boolean;
  unit: string;
  stats: readonly [StandingStat, StandingStat];
  /** The viewer's numbers, or null to show `message` instead. */
  record: { value: ReactNode; stats: readonly [ReactNode, ReactNode] } | null;
  message: ReactNode;
  cta: ReactNode;
}) {
  const showRecord = record !== null || pending;
  const recordBlock = (hidden: boolean) => (
    <div
      className={hidden ? "invisible [grid-area:1/1]" : "[grid-area:1/1]"}
      aria-hidden={hidden || undefined}
      aria-busy={(!hidden && pending) || undefined}
    >
      {!hidden && pending ? <span className="sr-only">Checking your standing…</span> : null}
      <p className="relative mt-2 font-mono text-5xl font-bold tabular-nums leading-none text-text-primary">
        {record?.value ?? "—"}
        <span className="ml-1 text-xl font-normal text-text-secondary">{unit}</span>
      </p>
      <dl className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
        {stats.map((s, i) => (
          <div key={s.label} className="bg-surface px-3 py-2.5">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {s.label}
            </dt>
            <dd
              className={
                "mt-0.5 font-mono text-lg font-bold tabular-nums " +
                (s.tone === "signal" ? "text-signal" : "text-text-secondary")
              }
            >
              {record?.stats[i] ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
  const messageLine = (className: string) => (
    <p className={`relative text-sm leading-relaxed text-text-secondary ${className}`}>{message}</p>
  );

  return (
    <section
      aria-label={label}
      data-climb-chrome
      // top-18 clears the sticky site header (56px) with the old 16px gap.
      className="climb-reveal relative overflow-hidden rounded-2xl border border-signal/30 bg-surface p-6 shadow-signal lg:sticky lg:top-18"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" aria-hidden="true" />

      <p className="relative font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {label}
      </p>

      {signedIn ? (
        <div className="relative grid grid-cols-1">
          {recordBlock(!showRecord)}
          {showRecord ? null : messageLine("[grid-area:1/1] self-center")}
        </div>
      ) : (
        messageLine("mt-3")
      )}

      <div className="relative mt-6">{cta}</div>
    </section>
  );
}
