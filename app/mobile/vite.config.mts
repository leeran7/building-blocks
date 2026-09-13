import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const dir = import.meta.dirname;

/**
 * Vite config for the bundled native SPA (Capacitor webDir).
 *
 * - `root` is this folder; `base: "./"` so the built asset URLs are relative,
 *   which is required when the app is served from the native `capacitor://` /
 *   `file://` scheme inside the WebView (absolute `/assets/...` paths 404).
 * - `@app` aliases the existing Next `src/` so the SPA reuses the game engine
 *   and components without copying them.
 */
export default defineConfig({
  root: dir,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@app": path.resolve(dir, "../src"),
    },
  },
  build: {
    outDir: path.resolve(dir, "dist"),
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    port: 5180,
  },
});
