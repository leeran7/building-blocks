/**
 * Hero — Landing page hero section.
 *
 * Design spec: design.md §6.4
 * Server component — static content.
 *
 * WCAG:
 * - CTA text: text-void (#0a0a0f) on bg-accent-tech (#00d4ff) = 5.2:1, AA pass
 * - All text on animated gradient: text-primary (#f0f0ff) ≥15:1 against void
 * - prefers-reduced-motion: gradient static, glow removed
 */

import Link from "next/link";

export function Hero() {
  return (
    <section
      aria-label="Hero"
      className="relative min-h-[100dvh] md:min-h-[80vh] flex flex-col items-center justify-center px-4 text-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #0d0d1a 0%, #0a0a0f 70%)",
        backgroundSize: "200% 200%",
      }}
    >
      {/* Animated gradient overlay — decorative, reduced-motion aware */}
      <div
        className="hero-bg-animated absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, #0d0d1a 0%, #0a0a0f 60%)",
          animation: "heroGradient 8s ease infinite",
          backgroundSize: "200% 200%",
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* H1 headline */}
        <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold text-text-primary leading-tight mb-4">
          The leaderboard that buries the weak
        </h1>

        {/* Sub-headline */}
        <p className="text-lg md:text-xl text-text-muted max-w-xl mx-auto mt-4 mb-8">
          Buy altitude. Survive the rise. Outlast everyone.
        </p>

        {/* Primary CTA */}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/auth/signup"
            className="hero-glow w-full max-w-xs bg-accent-tech text-void font-semibold rounded-lg px-8 py-4 text-base inline-flex items-center justify-center transition-all hover:brightness-110 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-void min-h-[44px]"
          >
            Enter the arena →
          </Link>

          {/* Secondary sign-in link */}
          <Link
            href="/auth/signin"
            className="text-sm text-text-muted underline hover:text-text-primary transition-colors mt-1 min-h-[44px] inline-flex items-center"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
