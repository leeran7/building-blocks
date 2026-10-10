/**
 * How the Telegram Mini App build is served from doomstack.lol. Owned by the
 * telegram target: next.config.js spreads `rewrites` and `headers` into the
 * site's config, and mobile/vite.config.mts reads `base`. `pnpm
 * mobile:build:hosted` writes the bundle to public${path}/ before `next build`.
 *
 * The BotFather Mini App URL is https://www.doomstack.lol/play/telegram.
 */

const path = "/play/telegram";

/**
 * Content-Security-Policy for the bundle, tighter than the site-wide one
 * (next.config.js): no Stripe, Google sign-in or Ably (Telegram has no duels),
 * and no eval.
 *  - script-src: the bundle, and Telegram's required telegram-web-app.js.
 *  - style-src 'unsafe-inline': components render <style> blocks.
 *  - connect-src: our API (same origin) and Firebase Auth's token endpoints
 *    (identitytoolkit / securetoken.googleapis.com) for the custom-token sign-in.
 *  - frame-src 'self': Firebase's auth handler is proxied onto our domain.
 *  - frame-ancestors: Telegram Web (web.telegram.org/k, /a) frames the Mini
 *    App. Telegram's mobile and desktop apps open it in a webview, not a frame.
 *    Browsers ignore the site-wide X-Frame-Options when frame-ancestors is set.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  // Vite inlines the smallest font subsets as data: URIs.
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-src 'self'",
  "frame-ancestors https://web.telegram.org https://*.web.telegram.org",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

module.exports = {
  /** Site path the bundle is served under. */
  path,
  /**
   * Vite `base` for the bundle's asset URLs. Absolute, not "./": the page is
   * served at /play/telegram (no trailing slash), where "./assets/x.js" would
   * resolve to /play/assets/x.js and 404.
   */
  base: `${path}/`,
  /** /play/telegram is a folder in public/, so Next needs its index.html named. */
  rewrites: [{ source: path, destination: `${path}/index.html` }],
  /** Next.js header entries for this path (later entries override the site-wide ones). */
  headers: [
    {
      source: `${path}/:path*`,
      headers: [{ key: "Content-Security-Policy", value: csp }],
    },
  ],
};
