// Flat ESLint config (ESLint 9 + Next 16). Replaces the legacy .eslintrc.json;
// Next 16 removed the built-in `next lint`, so linting now runs via the ESLint
// CLI (`eslint .`) which auto-discovers this file. `eslint-config-next/core-web-vitals`
// ships a ready-made flat-config array.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    // ESLint 9 flat config defaults reportUnusedDisableDirectives to "warn";
    // the legacy `next lint` (eslint 8) left it off. Several existing
    // `eslint-disable-next-line react-hooks/exhaustive-deps` comments are now
    // stale (the rule no longer fires there). Keep prior behavior rather than
    // editing those directives out one by one — revisit as a focused cleanup.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    // Flat config has no implicit ignores — replicate what `next lint` skipped.
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    // eslint-config-next 16 pulls react-hooks v6, which enables the new
    // React-Compiler-era rules as ERRORS. This codebase does not use the React
    // Compiler, and these rules flag long-standing, working effect/ref patterns
    // across the game loop and duel UI. Adopting them is a deliberate, separate
    // cleanup — not a side effect of a dependency bump — so keep them off here.
    // The classic rules (rules-of-hooks, exhaustive-deps) remain active.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    // Test files were not covered by `next lint` (it scoped to app/src). They
    // intentionally construct elements with a `children` prop via createElement.
    files: ["tests/**"],
    rules: {
      "react/no-children-prop": "off",
    },
  },
];

export default config;
