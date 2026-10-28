/**
 * True in the website build of the app (`pnpm mobile:build --mode web`, served
 * by the site at /play and /daily). Vite sets MODE to the build target, so the
 * flag is a constant the bundler folds: the native app and the portals never
 * carry the web-only branches, and the web bundle never carries theirs.
 */
export const WEB_BUILD = import.meta.env.MODE === "web";
