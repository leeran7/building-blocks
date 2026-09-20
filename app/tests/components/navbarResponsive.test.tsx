/**
 * Navbar responsive contract (mobile overlap fix).
 *
 * The desktop nav links (1v1 / Daily / Free climb) must be genuinely hidden
 * below `sm` so they don't render under the DOOMSTACK wordmark on phones. The
 * bug: the shared GHOST class baked in `inline-flex`, which collided with the
 * per-link `hidden` at the same specificity and won — the links stayed visible.
 *
 * Renders the real Navbar (no source-text grep) and asserts the class contract
 * on the actual anchor tags.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => undefined }),
}));

import { Navbar } from "../../src/components/Navbar";
import { FREE_CLIMB_HREF, DUEL_HREF, DAILY_HREF } from "../../src/components/navLinks";

/** The opening <a> tag whose href exactly matches, or undefined. */
function anchorWithHref(html: string, href: string): string | undefined {
  return [...html.matchAll(/<a\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((tag) => tag.includes(`href="${href}"`));
}

/** class="..." value of a tag. */
function classOf(tag: string): string {
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}

// A standalone `inline-flex` display utility (NOT the `sm:inline-flex` variant),
// which would override `hidden` at the same specificity and re-leak the links.
const BARE_INLINE_FLEX = /(?<![-\w:])inline-flex(?![-\w])/;

describe("Navbar responsive nav links", () => {
  const html = renderToStaticMarkup(createElement(Navbar, { contextLabel: "1v1" }));

  for (const href of [DUEL_HREF, DAILY_HREF, FREE_CLIMB_HREF]) {
    it(`nav link ${href} is hidden below sm and shows at sm+`, () => {
      const tag = anchorWithHref(html, href);
      expect(tag).toBeDefined();
      const cls = classOf(tag!);
      expect(cls).toContain("hidden");
      expect(cls).toContain("sm:inline-flex");
      // Guard: no unconditional inline-flex that would defeat `hidden` on mobile.
      expect(cls).not.toMatch(BARE_INLINE_FLEX);
    });
  }

  it("keeps the breadcrumb label truncatable so it can't overflow the row", () => {
    // The context label sits in a min-w-0 group with a truncate span; this is
    // what prevents wordmark/breadcrumb from colliding with the auth buttons.
    expect(html).toMatch(/truncate/);
    expect(html).toContain("1v1");
  });
});
