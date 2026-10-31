"use client";

import "./globals.css";

/**
 * The root layout itself failed, so app/error.tsx can't render (it lives
 * inside that layout). This replaces the whole document, so it brings its own
 * html and body and keeps to plain markup: no header, no providers.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong — Doomstack</title>
      </head>
      <body className="bg-void text-text-primary font-sans min-h-screen antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Error</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Something went wrong</h1>
          <p className="mt-3 max-w-md text-text-secondary">Doomstack hit a problem loading. Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-full bg-signal px-6 text-sm font-semibold text-void"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
