import { defineConfig } from "vitest/config";
import { resolve } from "path";

// .mts + import.meta.dirname: vitest 5's native config loader loads this as ESM,
// where CommonJS __dirname is unavailable. import.meta.dirname (Node 20.11+) is
// the equivalent. We run on Node 24.
const rootDir = import.meta.dirname;

export default defineConfig({
  // vite 8 transforms with oxc, which handles the automatic JSX runtime for
  // .tsx out of the box — no explicit esbuild/jsx option needed (it would be
  // ignored and warn).
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/__tests__/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    alias: {
      "@": resolve(rootDir, "."),
      // Mirrors mobile/vite.config.mts + mobile/tsconfig.json: the Capacitor
      // SPA under mobile/src reaches shared Next code through "@app/*". Without
      // this, any test of a mobile/src module that imports a shared lib
      // (e.g. challenge components -> @app/lib/handle) fails to resolve.
      "@app": resolve(rootDir, "src"),
    },
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "."),
      "@app": resolve(rootDir, "src"),
    },
  },
});
