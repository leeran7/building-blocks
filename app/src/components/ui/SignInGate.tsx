import Link from "next/link";
import { SIGNIN_HREF } from "../navLinks";

export function SignInGate({
  message,
  redirectPath,
  ctaLabel = "Sign in to play",
}: {
  message: string;
  redirectPath: string;
  ctaLabel?: string;
}) {
  return (
    <section className="bg-surface rounded-xl border border-border-subtle p-6 text-center">
      <p className="text-text-secondary text-sm mb-4">{message}</p>
      <Link
        href={`${SIGNIN_HREF}?redirect=${encodeURIComponent(redirectPath)}`}
        className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm tracking-tight hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100 transition-[filter,transform,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}
