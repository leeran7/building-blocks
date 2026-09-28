import { initialsOf, tintFor } from "../lib/leaderboard";
import { stickColorOf } from "@app/lib/avatars";
import { avatarSrc } from "../lib/avatarImages";

/**
 * A climber's hex badge, tinted per player: their chosen avatar art when set,
 * else their initials. Decorative — the name is always rendered alongside.
 */
export function HexAvatar({
  userId,
  name,
  size,
  avatarId,
}: {
  userId: string;
  name: string;
  size: number;
  avatarId?: string | null;
}) {
  const tint = tintFor(userId);
  const src = avatarSrc(avatarId);
  const stick = stickColorOf(avatarId);
  return (
    <span
      aria-hidden
      className="hex flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, background: tint, padding: Math.max(2, size / 28) }}
    >
      <span
        className="hex flex h-full w-full items-center justify-center overflow-hidden font-display font-black"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 38%, #17161c), #0f0e12 80%)`,
          color: tint,
          fontSize: size * 0.34,
        }}
      >
        {stick !== null ? (
          <StickBadge color={stick} />
        ) : src ? (
          // next/image needs the Next server; this is the Vite/Capacitor SPA.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          initialsOf(name)
        )}
      </span>
    </span>
  );
}

/** A stick figure's badge: the in-game vector figure's idle pose in its colour. */
function StickBadge({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 40" className="h-[78%] w-[78%]" aria-hidden>
      <g stroke="#0a0a0c" strokeWidth="6.2" strokeLinecap="round" fill="none">
        <path d="M18.8 26 16 36M21.2 26 24 36M18 21.5 14.4 29M22 21.5 25.6 29" />
        <ellipse cx="20" cy="23" rx="3.4" ry="5.5" />
        <circle cx="20" cy="11" r="5.2" />
      </g>
      <g stroke={color} strokeWidth="2.8" strokeLinecap="round" fill="none">
        <path d="M18.8 26 16 36M21.2 26 24 36M18 21.5 14.4 29M22 21.5 25.6 29" />
      </g>
      <ellipse cx="20" cy="23" rx="3.4" ry="5.5" fill={color} />
      <circle cx="20" cy="11" r="5.2" fill={color} />
      <circle cx="22" cy="10.8" r="1.3" fill="#0a0a0c" />
    </svg>
  );
}
