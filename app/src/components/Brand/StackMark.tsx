/**
 * StackMark — the Doomstack logo mark.
 *
 * A stack of bars in the duotone: signal-lime leader at the summit, descending,
 * ember at the base (the doom / burial). Pairs with the DOOMSTACK wordmark.
 * Decorative by default (aria-hidden); pass a `title` to make it labelled.
 */

export function StackMark({
  className = "h-6 w-6",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect x="6.5" y="8" width="19" height="3.6" rx="1.8" fill="#cbf24d" />
      <rect x="6.5" y="14.2" width="14" height="3.6" rx="1.8" fill="#6b6b8a" />
      <rect x="6.5" y="20.4" width="9.5" height="3.6" rx="1.8" fill="#ff5a2c" />
    </svg>
  );
}
