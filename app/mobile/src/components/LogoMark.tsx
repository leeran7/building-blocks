import iconUrl from "../assets/brand/doomstack-icon.svg";
import logoUrl from "../assets/brand/doomstack-logo.svg";

/**
 * The Doomstack app icon: DOOM over STACK, with STACK sinking into lava, on
 * the rounded void chip. Same artwork as the native app icon and
 * public/logo-1024.svg (source: public/brand/).
 */
export function LogoMark({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Vite app, not Next
    <img
      src={iconUrl}
      width={size}
      height={size}
      className={className}
      alt="Doomstack"
      draggable={false}
    />
  );
}

/** The full stacked DOOMSTACK logo on a transparent background (dark UI only). */
export function LogoLockup({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- Vite app, not Next
  return <img src={logoUrl} className={className} alt="Doomstack" draggable={false} />;
}
