/** Rotates 45deg (→ "×") when the parent <details class="group"> is open. */
export function Chevron() {
  return (
    <svg
      className="w-5 h-5 text-text-muted transition-transform duration-200 group-open:rotate-45 group-open:text-signal flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
