import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const dir = import.meta.dirname;

/** Build targets (mobile/src/targets/types.ts TARGET_IDS). */
const TARGETS = ["app", "crazygames", "youtube", "itch", "telegram", "discord"];

/** Targets served from doomstack.lol: built into public/<path> (targets/<t>/hosting.cjs). */
const HOSTED = ["telegram", "discord"];

interface Hosting {
  path: string;
  base: string;
}

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
 * A target's optional `src/targets/<target>/head.html`, prepended to <head> so
 * a host SDK (YouTube Playables) loads before any game code.
 */
function targetHead(target: string): Plugin {
  const file = path.resolve(dir, "src/targets", target, "head.html");
  return {
    name: "target-head",
    transformIndexHtml: (html) =>
      existsSync(file) ? html.replace("<head>", `<head>\n${readFileSync(file, "utf8")}`) : html,
  };
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
 */
export default defineConfig(({ mode }) => {
  const target = targetFor(mode);
  const hosting: Hosting | null = HOSTED.includes(target)
    ? createRequire(import.meta.url)(`./src/targets/${target}/hosting.cjs`)
    : null;
  return {
    root: dir,
    base: hosting?.base ?? "./",
    plugins: [react(), targetHead(target)],
    resolve: {
      alias: {
        "@app": path.resolve(dir, "../src"),
        // One target's config, root and adapters (src/targets/types.ts).
        "@target": path.resolve(dir, "src/targets", target),
      },
    },
    build: {
      // The native app keeps mobile/dist (capacitor.config.ts webDir); hosted
      // targets go where Next serves them; portals get a folder to zip.
      outDir: hosting
        ? path.resolve(dir, "../public", `.${hosting.path}`)
        : path.resolve(dir, target === "app" ? "dist" : `dist-${target}`),
      emptyOutDir: true,
      target: "es2020",
    },
    server: {
      port: 5180,
    },
  };
});
