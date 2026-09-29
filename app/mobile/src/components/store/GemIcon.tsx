/** The Shop's gem: a faceted lime diamond, like the store design. Decorative. */
export function GemIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 2 21 12 12 22 3 12Z" fill="#cbf24d" />
      <path d="M12 2 16 12 12 22 8 12Z" fill="#e6ff8a" opacity="0.85" />
      <path d="M3 12h18L12 22Z" fill="#000" opacity="0.18" />
    </svg>
  );
}
