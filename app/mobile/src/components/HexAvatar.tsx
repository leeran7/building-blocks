import { initialsOf, tintFor } from "../lib/leaderboard";

/** Hex badge with a climber's initials, tinted per player — same mark as on Ranks. */
export function HexAvatar({ userId, name, size }: { userId: string; name: string; size: number }) {
  const tint = tintFor(userId);
  return (
    <span
      aria-hidden
      className="hex flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, background: tint, padding: Math.max(2, size / 28) }}
    >
      <span
        className="hex flex h-full w-full items-center justify-center font-display font-black"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 38%, #17161c), #0f0e12 80%)`,
          color: tint,
          fontSize: size * 0.34,
        }}
      >
        {initialsOf(name)}
      </span>
    </span>
  );
}
