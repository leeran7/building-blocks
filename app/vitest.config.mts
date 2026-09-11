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
    },
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "."),
    },
  },
});
