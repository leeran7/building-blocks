# Doomstack — native app (Capacitor)

The bundled native game shell. A Vite React SPA (`mobile/`) reuses the existing
game engine (`../src/game`, `../src/components/Game`) via the `@app` alias and
talks to the Doomstack API over `CapacitorHttp`. No `server.url` — the UI ships
in the binary and boots from a native splash.

## Commands (run from `app/`)

| Command | What it does |
|---|---|
| `pnpm mobile:dev` | Vite dev server (browser preview; API calls hit prod and may be CORS-blocked — device is the real target) |
| `pnpm mobile:build` | Build the SPA into `mobile/dist` |
| `pnpm cap:sync` | Build + copy into `ios/` and `android/` |
| `pnpm cap:ios` | Sync + open Xcode |
| `pnpm cap:android` | Sync + open Android Studio |

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

## Free-to-play

All real-money features (chips, chip duels, tournaments, payouts) stay hidden on
native for the first release — they're already gated by `PAID_DUELS_ENABLED` +
geo, and no paid UI is ported into the SPA.
