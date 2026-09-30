/**
 * Wordmark — the one-line DOOMSTACK logo (DOOM in bone, STACK in lime sinking
 * into lava). Used in the navbar, footer and auth headers. The artwork lives in
 * public/brand/ (text converted to outlines, so it needs no font); `light`
 * picks the version drawn for light backgrounds.
 */

export function Wordmark({
  className = "h-8 w-auto",
  light = false,
  decorative = false,
}: {
  className?: string;
  light?: boolean;
  /** True when a parent already names the link (e.g. aria-label="Doomstack — home"). */
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
    <img
      src={light ? "/brand/doomstack-wordmark-light.svg" : "/brand/doomstack-wordmark.svg"}
      alt={decorative ? "" : "Doomstack"}
      width={1100}
      height={326}
      className={className}
      draggable={false}
    />
  );
}
