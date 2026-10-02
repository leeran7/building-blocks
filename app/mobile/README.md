# Doomstack — native app (Capacitor)

The bundled native game shell. A Vite React SPA (`mobile/`) reuses the existing
game engine (`../src/game`, `../src/components/Game`) via the `@app` alias and
talks to the Doomstack API over `CapacitorHttp`. No `server.url` — the UI ships
in the binary and boots from a native splash.

## Commands (run from `app/`)

Each also works from the repo root, e.g. `yarn cap:ios` (delegates to
`pnpm --dir app cap:ios`).

| Command | What it does |
|---|---|
| `pnpm mobile:dev` | Vite dev server (browser preview; API calls hit prod and may be CORS-blocked — device is the real target) |
| `pnpm mobile:build` | Build the SPA into `mobile/dist` |
| `pnpm cap:sync` | Build + copy into `ios/` and `android/` |
| `pnpm cap:ios` | Sync + open Xcode |
| `pnpm cap:ios:run` | Sync + run on an iOS simulator/device |
| `pnpm cap:ios:preview` | Preview build against a Vercel preview deployment (see below) + open Xcode |
| `pnpm cap:android` | Sync + open Android Studio |

## Preview builds against a Vercel preview

By default the app talks to `https://www.doomstack.lol`. To try a branch's
backend (API routes, migrations on the preview DB) from Xcode:

1. `cp mobile/.env.preview.example mobile/.env.preview.local` (git-ignored) and
   set `VITE_API_BASE` to the preview URL. The branch alias
   (`building-blocks-git-<branch>-leeran7s-projects.vercel.app`) always tracks
   the branch's latest deploy.
2. Preview URLs sit behind Vercel Authentication, so set `VITE_VERCEL_BYPASS`
   to the secret from Vercel → Project Settings → Deployment Protection →
   **Protection Bypass for Automation**. It is sent as the
   `x-vercel-protection-bypass` header on API calls.
3. `pnpm cap:ios:preview`, then Run from Xcode. The app shows an orange
   `PREVIEW · <host>` badge so it can't be mistaken for a prod build.

These values only apply to Vite's `preview` mode. `pnpm cap:sync` / `cap:ios`
build in production mode and ignore them, so run one of those again before
archiving for TestFlight or the App Store (Xcode ships whatever was last
synced). Share links point at the preview host, and only `www.doomstack.lol`
links open inside the app.

Sandbox (Xcode/TestFlight) gem purchases are only credited for uids listed in
`APPLE_IAP_SANDBOX_UIDS`, so set that on the Vercel Preview environment too.

## Native sign-in setup (required for Apple/Google; guest works without it)

Sign-in uses `@capacitor-firebase/authentication`. Until the files below are
added, the app runs in **guest** mode (climbs play but don't persist).

1. **Firebase console** → enable the **Apple** and **Google** sign-in providers
   for project `building-blocks-88190`.

2. **iOS** (`ios/App/App/`):
   - Add `GoogleService-Info.plist` (Firebase → iOS app for bundle id
     `lol.doomstack.app`).
   - In Xcode → Signing & Capabilities: add **Sign in with Apple**.
   - Add the Google reversed-client-id URL scheme to `Info.plist`
     (`REVERSED_CLIENT_ID` from the plist).

3. **Android** (`android/app/`):
   - Add `google-services.json` (Firebase → Android app for `lol.doomstack.app`).
   - Register the app's **SHA-1** (debug + release) in the Firebase console for
     Google sign-in.

4. `pnpm cap:sync`, then build/run from Xcode / Android Studio.

The Firebase ID token from sign-in is sent as a `Bearer` header by
`mobile/src/lib/api.ts`; every Doomstack API route already verifies it
(`src/lib/requireAuth.ts`), so no backend change is needed.

## Challenge deep links (Universal / App Links)

The **Challenge** card creates a private 1v1 race and shares an `https://www.doomstack.lol/duel/:id`
link. On devices with the app installed, that link opens straight into the
native race room (`DuelRoomScreen`) via verified deep links; elsewhere it falls
back to the web. Routing is handled by the `appUrlOpen` listener in
`mobile/src/lib/useNativeShell.ts`.

To make verification pass in production, two things are needed:

1. **Association files** (already scaffolded, served by the Next app):
   - `/.well-known/apple-app-site-association` — set env `APPLE_APP_ID_PREFIX`
     to the Apple Developer **Team ID** (full appID becomes `<TeamID>.lol.doomstack.app`).
   - `/.well-known/assetlinks.json` — set env `ANDROID_SHA256_FINGERPRINTS` to a
     comma-separated list of the app-signing **SHA-256** fingerprints (include
     both the Play App Signing cert and the upload cert if they differ).

   Both serve placeholders until these env vars are set, so a **web deploy with
   the real values is required** before links verify.

2. **Native capability**:
   - iOS: `applinks:www.doomstack.lol` is in the three `App*.entitlements`;
     enable the **Associated Domains** capability for the App ID in the Apple
     Developer portal / Xcode signing.
   - Android: the `autoVerify` intent-filter is in `AndroidManifest.xml`; no
     extra step beyond `assetlinks.json` being reachable.

## Free-to-play

All real-money features (chips, chip duels, tournaments, payouts) stay hidden on
native for the first release — they're already gated by `PAID_DUELS_ENABLED` +
geo, and no paid UI is ported into the SPA.
