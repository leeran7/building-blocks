import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tapLight } from "../lib/haptics";

/**
 * Shared UI primitives for the native game shell. Every screen composes these
 * so buttons, headers, cards and list rows read as one cohesive premium game
 * app. Tokens only (ASCENT palette from styles.css) — no hardcoded hex.
 *
 * Sizing contract: primary tap targets are >= 52px, secondary >= 44px, all
 * with `active:scale` press feedback and a light haptic on tap.
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  // Filled signal — the one dominant action per screen.
  primary:
    "bg-signal text-void shadow-signal font-black " +
    "disabled:bg-elevated disabled:text-text-disabled disabled:shadow-none",
  // Outlined surface — supporting actions.
  secondary:
    "border border-border-strong bg-surface-raised text-text-primary font-bold " +
    "disabled:text-text-disabled disabled:border-border-subtle",
  // Text-only — tertiary / dismissive.
  ghost:
    "text-text-secondary font-bold disabled:text-text-disabled",
  // Ember outline — destructive.
  danger:
    "border border-ember/40 bg-ember/10 text-ember font-bold " +
    "disabled:opacity-50",
};

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  /** Renders a spinner-dot and disables the button. */
  busy?: boolean;
  fullWidth?: boolean;
  /** Fires a light haptic before the handler. */
  onPress?: () => void;
  children: ReactNode;
}

/**
 * Canonical action button. Uppercase display type, pill shape, 52px tall,
 * haptic + press-scale feedback. Use `variant` for hierarchy.
 */
export function Button({
  variant = "primary",
  busy = false,
  fullWidth = true,
  onPress,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      onClick={() => {
        if (disabled || busy) return;
        void tapLight();
        onPress?.();
      }}
      className={cx(
        "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full px-6",
        "font-display text-sm uppercase tracking-wide",
        "transition-transform duration-150 active:scale-[0.97]",
        "disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void",
        fullWidth && "w-full",
        VARIANT[variant],
        className,
      )}
    >
      {busy ? <Dots /> : children}
    </button>
  );
}

function Dots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      <Dot delay="0s" />
      <Dot delay="0.15s" />
      <Dot delay="0.3s" />
      <style>{`@keyframes uiPulse{0%,80%,100%{opacity:.25}40%{opacity:1}}@media (prefers-reduced-motion: reduce){.ui-dot{animation:none!important;opacity:.6}}`}</style>
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="ui-dot h-1.5 w-1.5 rounded-full bg-current"
      style={{ animation: `uiPulse 1s ${delay} infinite` }}
    />
  );
}

/* ------------------------------------------------------------- ScreenHeader */

export interface ScreenHeaderProps {
  title: string;
  /** Small uppercase mono eyebrow above the title. */
  eyebrow?: string;
  /** Called when the back chevron is tapped. Omit to hide the back control. */
  onBack?: () => void;
  /** Optional trailing control (e.g. an icon action) aligned right. */
  trailing?: ReactNode;
}

/**
 * Consistent overlay-screen header: safe-area top padding, a 44px circular
 * back target, an optional eyebrow, and the display title. Shared by every
 * pushed screen so headers stop diverging.
 */
export function ScreenHeader({
  title,
  eyebrow,
  onBack,
  trailing,
}: ScreenHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      {onBack && (
        <button
          aria-label="Back"
          onClick={() => {
            void tapLight();
            onBack();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface/70 text-text-secondary transition-transform active:scale-90"
        >
          <ChevronLeft />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-text-muted">
            {eyebrow}
          </p>
        )}
        <h1 className="truncate font-display text-lg font-black uppercase leading-tight tracking-tight text-text-primary">
          {title}
        </h1>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}

/* --------------------------------------------------------------- PushHeader */

export interface PushHeaderProps {
  title: string;
  /** Called after the haptic when the back button is tapped. */
  onBack: () => void;
}

/**
 * Header for the Profile push screens (Edit Profile, Choose avatar): a 48px
 * glass back button and the large metal display title.
 *
 * The focus indicator is an outline, not a ring: `.glass` is unlayered CSS and
 * sets box-shadow, which beats Tailwind's layered ring utilities, so a
 * `focus-visible:ring-*` on a glass element never shows.
 */
export function PushHeader({ title, onBack }: PushHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <button
        type="button"
        aria-label="Back"
        onClick={() => {
          void tapLight();
          onBack();
        }}
        className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-text-primary transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <ChevronLeft size={22} />
      </button>
      <h1 className="metal-title font-display text-[1.9rem] font-black uppercase leading-none tracking-[-0.02em]">
        {title}
      </h1>
    </header>
  );
}

function ChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/* --------------------------------------------------------------------- Card */

export interface CardProps {
  children: ReactNode;
  /** Signal-tinted border + glow to mark the "active/you" card. */
  highlight?: boolean;
  className?: string;
}

/**
 * Surface container with consistent radius, padding and border. `highlight`
 * gives it the signal accent used for the current-user / active state.
 */
export function Card({ children, highlight = false, className }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-3xl border px-5 py-4",
        highlight
          ? "border-signal/40 bg-signal/[0.07]"
          : "border-border-subtle bg-surface/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ StatCard */

export interface StatCardProps {
  label: string;
  value: string;
  accent?: boolean;
}

/** Compact metric tile used in stat grids. */
export function StatCard({ label, value, accent = false }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/80 px-3 py-4 text-center">
      <p
        className={cx(
          "font-display text-2xl font-black leading-none tabular-nums",
          accent ? "text-signal" : "text-text-primary",
        )}
      >
        {value}
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">
        {label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ ListRow */

export interface ListRowProps {
  children: ReactNode;
  highlight?: boolean;
  onPress?: () => void;
  className?: string;
}

/**
 * A single row in a scrollable list (leaderboard, settings groups). Consistent
 * height, radius and padding; `highlight` marks the current user.
 */
export function ListRow({
  children,
  highlight = false,
  onPress,
  className,
}: ListRowProps) {
  const base = cx(
    "flex items-center gap-3 rounded-2xl border px-4 py-3.5",
    highlight
      ? "border-signal/40 bg-signal/[0.08]"
      : "border-border-subtle bg-surface/70",
    className,
  );
  if (onPress) {
    return (
      <button
        onClick={() => {
          void tapLight();
          onPress();
        }}
        className={cx(base, "w-full text-left transition-transform active:scale-[0.98]")}
      >
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

/* --------------------------------------------------------- ScreenScrollBody */

/**
 * Standard scroll region for pushed screens: fills remaining height, scrolls,
 * and reserves safe-area bottom padding so content clears the home indicator.
 */
export function ScreenBody({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex-1 overflow-y-auto px-4 pb-4"
      // Native iOS momentum scroll with a contained rubber-band so the bounce
      // never leaks to the page (which would read as a web view).
      style={{
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- StateMsg */

/** Centered empty / error message for list screens. */
export function StateMessage({ children }: { children: ReactNode }) {
  return (
    <p className="px-6 pt-16 text-center text-sm leading-relaxed text-text-secondary">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------- RetryPanel */

export interface RetryPanelProps {
  /** What failed and what to do, in plain words. */
  message: ReactNode;
  /** From useRetry: the refresh is in flight. */
  retrying: boolean;
  /** From useRetry: bumps once per settled retry, re-announcing the message. */
  attempts: number;
  onRetry: () => void;
  /** Extra actions under Try again (e.g. Sign out). */
  children?: ReactNode;
}

/**
 * Load-failure state with a Try again button that survives its own retry.
 * The screen keeps this mounted while `retrying` (see useRetry), so the same
 * button element keeps focus through a retry that fails again, and the alert
 * re-mounts so screen readers hear the failure again. `aria-disabled` rather
 * than `disabled` while busy: disabling the focused button would drop focus
 * to <body>.
 */
export function RetryPanel({ message, retrying, attempts, onRetry, children }: RetryPanelProps) {
  return (
    <div className="flex flex-col items-center gap-4 pb-6">
      <div role="alert" key={attempts}>
        <StateMessage>{message}</StateMessage>
      </div>
      <button
        type="button"
        aria-disabled={retrying}
        aria-busy={retrying}
        onClick={() => {
          if (retrying) return;
          void tapLight();
          onRetry();
        }}
        className="glass min-h-[48px] rounded-2xl border border-white/10 px-6 text-[15px] font-semibold text-text-primary transition-opacity aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        {retrying ? "Retrying…" : "Try again"}
      </button>
      {children}
    </div>
  );
}
