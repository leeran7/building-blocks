/**
 * The website serves the app on more than one page (next.config.js rewrites
 * /play and /daily onto it). The app routes by hash, so the page a visitor
 * opened picks the screen it starts on. A hash already in the URL (a reload,
 * a deep link) always wins.
 */

/** The app route a website page opens on, or null to leave the hash alone. */
export function webStartRoute(pathname: string, search: string, hash: string): string | null {
  if (hash.length > 1) return null;
  // Back from Stripe Checkout (success or cancel): the Shop, where the balance shows.
  if (new URLSearchParams(search).has("gems")) return "/shop";
  if (pathname.replace(/\/+$/, "") === "/daily") return "/climb?daily=1";
  return null;
}
