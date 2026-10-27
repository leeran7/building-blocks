import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localDbProblems } from "./scripts/localDbGuard";

/**
 * UX checks (`pnpm ux`): every app screen and web page at phone, small phone
 * and desktop sizes, measured against tests/ux/baseline.json.
 *
 * Two servers: the app SPA (Vite) and the website (Next). The website needs a
 * migrated database in DATABASE_URL; set UX_SURFACES=app to check the app only.
 * CI builds the website first and serves it with `next start`.
 */

const surfaces = process.env.UX_SURFACES ?? "all";

// The website server writes to its database (sessions, guest rows), so it only
// runs against a database on this machine, and without payment or admin keys.
if (surfaces !== "app") {
  const problems = localDbProblems(process.env);
  if (problems.length > 0) throw new Error(`pnpm ux needs a local database for the website:\n${problems.join("\n")}\nOr set UX_SURFACES=app.`);
}
// Every server-side key the website knows (.env.example) is blanked except the
// local database, so no run reaches production Stripe, Redis, Ably, Firebase or
// App Store Connect from the server. Empty rather than removed: Next never lets
// a .env file override a variable that is already set.
const WEB_KEEP = new Set(["DATABASE_URL", "DIRECT_URL"]);
const webKeys = readFileSync(join(__dirname, ".env.example"), "utf8")
  .split("\n")
  .map((line) => /^([A-Z_][A-Z0-9_]*)=/.exec(line)?.[1])
  .filter((name): name is string => name !== undefined && !WEB_KEEP.has(name));
const webEnv: Record<string, string> = {
  ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
  ...Object.fromEntries(webKeys.map((name) => [name, ""])),
  // The baseline is measured with paid modes on (the CI job sets the same).
  // A prebuilt site (CI=1) keeps the public flag it was built with.
  PAID_DUELS_ENABLED: "true",
  NEXT_PUBLIC_PAID_DUELS_ENABLED: "true",
};
const appServer = {
  command: "pnpm mobile:dev --port 5174 --strictPort",
  url: "http://localhost:5174/index.html",
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};
const webServer = {
  command: process.env.CI ? "pnpm start -p 3100" : "pnpm dev -p 3100",
  url: "http://localhost:3100",
  // A server already on :3100 would skip the guard and the blanked keys above,
  // so reusing one is opt-in (UX_REUSE_WEB=1) for a server you started yourself
  // the same way.
  reuseExistingServer: !process.env.CI && process.env.UX_REUSE_WEB === "1",
  timeout: 240_000,
  env: webEnv,
};

export default defineConfig({
  testDir: "./tests/ux",
  globalSetup: "./tests/ux/globalSetup.ts",
  outputDir: "./test-results/ux-artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/ux", open: "never" }]],
  use: { trace: "retain-on-failure", reducedMotion: "reduce", serviceWorkers: "block" },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "small", use: { ...devices["iPhone SE"], defaultBrowserType: "chromium", viewport: { width: 320, height: 568 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: surfaces === "app" ? [appServer] : surfaces === "web" ? [webServer] : [appServer, webServer],
});
