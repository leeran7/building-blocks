/**
 * How the Discord build is served from doomstack.lol. Owned by the discord target:
 * next.config.js spreads `rewrites` and `headers` into the site's config, and
 * mobile/vite.config.mts reads `base`. `pnpm mobile:build:hosted` writes the
 * bundle to public${path}/ before `next build`.
 *
 * Inside Discord the Activity is served by Discord's proxy at
 * https://<client_id>.discordsays.com/, whose root URL mapping points at
 * www.doomstack.lol/play/discord. A request for /x on discordsays.com reaches
 * the site as /play/discord/x. So:
 *  - `base` is the absolute site path, so asset URLs work when the bundle is
 *    opened directly (www.doomstack.lol/play/discord shows "Open in Discord").
 *  - Inside Discord the same asset URL (/play/discord/assets/x.js) arrives as
 *    /play/discord/play/discord/assets/x.js; the rewrite folds it back.
 *  - The entry (with or without the doubled prefix) serves index.html. Public
 *    files are served before these rewrites run, so real files always win.
 */

const PATH = "/play/discord";

/** Who may frame the Activity: the Discord clients and Discord's Activity proxy. */
const FRAME_ANCESTORS = "https://discord.com https://*.discord.com https://*.discordsays.com";

/**
 * Tighter than the site-wide CSP (next.config.js): the bundle is self-contained
 * (scripts, fonts, images, audio ship in it) and every network call inside
 * Discord goes to the Activity's own discordsays.com origin through the proxy
 * (API, Firebase Auth and Ably via URL mappings). No Stripe, no Google scripts,
 * no third-party frames. 'unsafe-inline' styles are for React/Motion inline
 * style attributes; there is no inline script and no eval.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  // 'self' is the discordsays.com origin when framed; wss is listed because
  // older WebKit does not match ws(s) against 'self'.
  "connect-src 'self' wss://*.discordsays.com",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  `frame-ancestors ${FRAME_ANCESTORS}`,
].join("; ");

module.exports = {
  /** Site path the bundle is served under. */
  path: PATH,
  /** Vite `base` for the bundle's asset URLs. */
  base: `${PATH}/`,
  /** Next.js rewrites for this path. */
  rewrites: [
    { source: PATH, destination: `${PATH}/index.html` },
    { source: `${PATH}${PATH}`, destination: `${PATH}/index.html` },
    { source: `${PATH}${PATH}/:path+`, destination: `${PATH}/:path+` },
  ],
  /** Next.js header entries for this path (later entries override the site-wide ones). */
  headers: [
    {
      source: `${PATH}/:path*`,
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        // frame-ancestors governs framing; X-Frame-Options cannot name Discord,
        // and browsers ignore it when frame-ancestors is present. Overridden
        // here so the site-wide SAMEORIGIN never reaches the Activity.
        { key: "X-Frame-Options", value: "ALLOWALL" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};
