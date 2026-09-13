/**
 * The Doomstack "stack" mark — three rounded bars (lime / slate / ember) that
 * echo the app icon and the tower you climb. Inline SVG so it's crisp at any
 * size, cheap (no image request), and consistent with the native icon.
 *
 * Brand colors are intentionally literal here (this IS the logo), mirroring
 * public/logo-1024.svg. `card` draws the rounded icon chip behind the bars for
 * icon-like contexts (splash, sign-in); omit it to float the bars on a surface.
 */
export function LogoMark({
  size = 48,
  card = false,
  className,
}: {
  size?: number;
  card?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label="Doomstack"
    >
      {card && (
        <rect width="1024" height="1024" rx="224" fill="var(--color-surface-raised)" />
      )}
      <rect x="208" y="256" width="608" height="115" rx="58" fill="#cbf24d" />
      <rect x="208" y="454" width="448" height="115" rx="58" fill="#6b6b8a" />
      <rect x="208" y="653" width="304" height="115" rx="58" fill="#ff5a2c" />
    </svg>
  );
}
