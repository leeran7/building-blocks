import { initialsOf, tintFor } from "../lib/leaderboard";
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
        {src ? (
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
