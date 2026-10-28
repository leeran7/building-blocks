import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const dir = import.meta.dirname;

/** Build targets (mobile/src/targets/types.ts TARGET_IDS). */
const TARGETS = ["app", "web", "crazygames"];

/**
 * `--mode <target>` picks the build target; Vite's own default modes
 * (development, production) build the native app. An unknown mode fails the
 * build rather than silently shipping the app bundle somewhere else.
 */
function targetFor(mode: string): string {
  if (mode === "development" || mode === "production") return "app";
  if (TARGETS.includes(mode)) return mode;
  throw new Error(`Unknown build target "${mode}". Expected one of: ${TARGETS.join(", ")}`);
}

/**
 * Vite config for the bundled native SPA (Capacitor webDir).
 *
 * - `root` is this folder; `base: "./"` so the built asset URLs are relative,
 *   which is required when the app is served from the native `capacitor://` /
 *   `file://` scheme inside the WebView (absolute `/assets/...` paths 404).
 * - `@app` aliases the existing Next `src/` so the SPA reuses the game engine
 *   and components without copying them.
 * - `@target` aliases the build target's folder (`--mode <target>`), so each
 *   bundle carries one target's config, root and adapters.
 * - The web target is served by the Next site from `public/app/` (rewritten
 *   onto /play and /daily, next.config.js), so its asset URLs are absolute
 *   under /app/: relative ones would resolve against /play.
 */

/** Where each target's bundle goes and the URL its assets load from. */
function outputFor(target: string): { outDir: string; base: string } {
  if (target === "app") return { outDir: path.resolve(dir, "dist"), base: "./" };
  if (target === "web") return { outDir: path.resolve(dir, "../public/app"), base: "/app/" };
  // Portals get a folder to zip.
  return { outDir: path.resolve(dir, `dist-${target}`), base: "./" };
}
/**
 * The website serves the web build as /play and /daily, so its page needs a
 * real title and description for search and link previews.
 */
function webPageHead(): Plugin {
  return {
    name: "doomstack-web-page-head",
    transformIndexHtml: (html) =>
      html.replace(
        "<title>Doomstack</title>",
        "<title>Play Doomstack: climb the tower before the lava catches you</title>\n" +
          '    <meta name="description" content="Play Doomstack free in your browser: climb level by level, race the rising lava in Endless and the Daily Climb, and unlock climbers." />',
      ),
  };
}

export default defineConfig(({ mode }) => {
  const target = targetFor(mode);
  const { outDir, base } = outputFor(target);
  return {
    root: dir,
    base,
    plugins: [react(), ...(target === "web" ? [webPageHead()] : [])],
    resolve: {
      alias: {
        "@app": path.resolve(dir, "../src"),
        // One target's config, root and adapters (src/targets/types.ts).
        "@target": path.resolve(dir, "src/targets", target),
      },
    },
    build: {
      // The native app keeps mobile/dist (capacitor.config.ts webDir).
      outDir,
      // The site's CSP allows fonts from 'self' only, so the web build ships
      // every font as a file rather than inlining small ones as data: URLs.
      ...(target === "web" ? { assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined) } : {}),
      emptyOutDir: true,
      target: "es2020",
    },
    server: {
      port: 5180,
    },
  };
});
