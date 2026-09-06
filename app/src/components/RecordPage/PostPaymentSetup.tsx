"use client";

/**
 * PostPaymentSetup — onboarding card shown after a successful purchase
 * (/b/[slug]?payment=success). Nudges a new creator to (1) claim a username /
 * creator page and (2) add their other social handles. Adaptive: hides steps
 * already done, renders nothing when both are complete, and is dismissible
 * (remembered per user in localStorage).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { SOCIAL_PLATFORMS } from "../../lib/socialHandle";

export function PostPaymentSetup() {
  const { user, token } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [linkedCount, setLinkedCount] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user) return;
    setDismissed(localStorage.getItem(`pps-dismissed-${user.uid}`) === "1");
  }, [user]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!live) return;
        setUsername(s?.username ?? null);
        const social = s?.social ?? {};
        setLinkedCount(SOCIAL_PLATFORMS.filter((p) => social[p]).length);
        setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [token]);

  const needsUsername = loaded && !username;
  // Only nudge to add socials when they have none — don't badger creators who've
  // already linked some but not all five.
  const needsSocials = loaded && linkedCount === 0;

  if (!loaded || dismissed || (!needsUsername && !needsSocials)) return null;

  function dismiss() {
    if (user) localStorage.setItem(`pps-dismissed-${user.uid}`, "1");
    setDismissed(true);
  }

  return (
    <section
      aria-label="Finish setting up your creator profile"
      className="reveal rounded-2xl border border-signal/30 bg-surface shadow-signal p-6 mb-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
        [ next: build your hub ]
      </p>
      <h2 className="font-display text-2xl text-text-primary mt-1">
        Make this a profile
      </h2>

      <ol className="mt-4 space-y-4">
        {needsUsername ? (
          <li>
            <p className="text-sm font-semibold text-text-primary">
              Your creator page
            </p>
            <p className="text-sm text-text-secondary mt-0.5">
              One public link for all your listings and climbs.
            </p>
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center bg-signal text-void font-semibold rounded-full px-4 min-h-[44px] hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            >
              Create page
            </Link>
          </li>
        ) : (
          username && (
            <li className="text-sm text-text-secondary">
              ✓ Your page:{" "}
              <Link href={`/c/${username}`} className="font-mono text-signal hover:underline">
                /c/{username} ↗
              </Link>
            </li>
          )
        )}

        {needsSocials && (
          <li>
            <p className="text-sm font-semibold text-text-primary">
              Add your other socials
            </p>
            <p className="text-sm text-text-secondary mt-0.5">
              Saved handles prefill next time and appear on your page.
            </p>
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center rounded-full border border-border-strong bg-surface/60 px-4 min-h-[44px] text-sm text-text-secondary hover:text-signal hover:border-signal/50 transition-colors"
            >
              Add social accounts
            </Link>
          </li>
        )}
      </ol>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss setup"
        className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        Dismiss
      </button>
    </section>
  );
}
