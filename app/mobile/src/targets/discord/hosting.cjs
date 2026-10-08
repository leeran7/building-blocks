/**
 * How the Discord build is served from doomstack.lol. Owned by the discord target:
 * next.config.js spreads `rewrites` and `headers` into the site's config, and
 * mobile/vite.config.mts reads `base`. `pnpm mobile:build:hosted` writes the
 * bundle to public${path}/ before `next build`.
 *
 * Placeholder until the discord workstream fills it in.
 */
module.exports = {
  /** Site path the bundle is served under. */
  path: "/play/discord",
  /** Vite `base` for the bundle's asset URLs. */
  base: "./",
  /** Next.js rewrites for this path. */
  rewrites: [],
  /** Next.js header entries for this path (later entries override the site-wide ones). */
  headers: [],
};
