import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const dir = import.meta.dirname;

/** Build targets (mobile/src/targets/types.ts TARGET_IDS). */
const TARGETS = ["app", "crazygames"];

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
 */
export default defineConfig(({ mode }) => {
  const target = targetFor(mode);
  return {
    root: dir,
    base: "./",
    plugins: [react()],
    resolve: {
      alias: {
        "@app": path.resolve(dir, "../src"),
        // One target's config, root and adapters (src/targets/types.ts).
        "@target": path.resolve(dir, "src/targets", target),
      },
    },
    build: {
      // The native app keeps mobile/dist (capacitor.config.ts webDir); portals
      // get a folder to zip.
      outDir: path.resolve(dir, target === "app" ? "dist" : `dist-${target}`),
      emptyOutDir: true,
      target: "es2020",
    },
    server: {
      port: 5180,
    },
  };
});
