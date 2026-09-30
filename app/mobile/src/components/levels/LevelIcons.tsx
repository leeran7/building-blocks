import type { BoosterType } from "@app/levels/engagement";
import { POWER_UP_SPECS } from "@app/game/powerups";

/**
 * Line icons for the level cards: the start card's row icons and a glyph per
 * booster, drawn in the booster's own colour. Decorative; the text beside
 * each one carries the meaning.
 */

type IconProps = { size?: number; className?: string };

function Line({ size = 18, className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Two peaks: power-ups found on the tower. */
export function TowerIcon(p: IconProps) {
  return (
    <svg aria-hidden width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" className={p.className} fill="currentColor">
      <path d="M1.5 20 9 6.5l4.2 7.4 2.3-3.4L22.5 20z" />
    </svg>
  );
}

export function BoltIcon(p: IconProps) {
  return (
    <svg aria-hidden width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" className={p.className} fill="currentColor">
      <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" />
    </svg>
  );
}

export function FriendsIcon(p: IconProps) {
  return (
    <svg aria-hidden width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" className={p.className} fill="currentColor">
      <circle cx="9" cy="8" r="3.6" />
      <path d="M1.8 20c0-3.9 3.2-6.6 7.2-6.6s7.2 2.7 7.2 6.6z" />
      <circle cx="17.2" cy="8.6" r="2.9" opacity="0.8" />
      <path d="M17.6 20c0-2.5-.8-4.5-2.2-5.8.6-.2 1.2-.3 1.9-.3 3.2 0 5 2.4 5 6.1z" opacity="0.8" />
    </svg>
  );
}

export function TrophyIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v4M8 20.5h8" />
    </Line>
  );
}

export function NoneIcon(p: IconProps) {
  return (
    <Line {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Line>
  );
}

export function CheckBadge({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full bg-signal text-void"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

export function ChevronRight({ size = 14, className = "" }: IconProps) {
  return (
    <Line size={size} className={className}>
      <path d="m9 6 6 6-6 6" />
    </Line>
  );
}

export function ArrowRight({ size = 16, className = "" }: IconProps) {
  return (
    <Line size={size} className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Line>
  );
}

/** Each booster's glyph, stroked in its power-up colour. */
const GLYPH: Record<BoosterType, React.ReactNode> = {
  "rapid-climb": <path d="m5 12 7-6.5 7 6.5M5 19l7-6.5 7 6.5" />,
  "sprint-burst": <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" fill="currentColor" stroke="none" />,
  "super-jump": (
    <>
      <path d="M12 16V3M6.5 8.5 12 3l5.5 5.5" />
      <path d="M5 21h14M8 18h8" />
    </>
  ),
  "slow-lava": (
    <>
      <path d="M3 17c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M12 3v8M8.5 7.5 12 11l3.5-3.5" />
    </>
  ),
  giant: <path d="M4 10V4h6M20 14v6h-6M4 4l6.5 6.5M20 20l-6.5-6.5M14 4h6v6M10 20H4v-6" />,
  jetpack: (
    <>
      <rect x="7" y="3" width="10" height="12" rx="3" />
      <path d="M9.5 18.5 9 21M14.5 18.5l.5 2.5M12 15v6" />
    </>
  ),
  "harden-lava": (
    <>
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
      <path d="M4 7l8 4.5L20 7M12 11.5v10" />
    </>
  ),
};

export function BoosterGlyph({ type, size = 28 }: { type: BoosterType; size?: number }) {
  return (
    <span style={{ color: POWER_UP_SPECS[type].color }} className="inline-flex">
      <Line size={size}>{GLYPH[type]}</Line>
    </span>
  );
}
