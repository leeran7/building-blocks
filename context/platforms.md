# Platforms

Every place Doomstack ships. **Before changing the game, check each row below:**
a change that is fine in the app can break a portal (network calls, Escape,
size). Add a row here in the same change that adds a target.

One codebase builds one bundle per target: `pnpm mobile:build --mode <target>`
picks `app/mobile/src/targets/<target>/` (`config.ts` + `root.tsx`). The
feature table is checked against each `config.ts` by
`app/tests/targets/platformsDoc.test.ts`, so it cannot drift.

## Targets

| Target | Ships to | Build output | Sign-in | Payments | Ads |
|--------|----------|--------------|---------|----------|-----|
| `app` | iOS and Android (Capacitor), web at doomstack.lol | `mobile/dist`, Xcode / Android Studio | Firebase: Apple, Google, email | iOS: StoreKit 2 gem packs. Android and web: Stripe Checkout | none |
| `crazygames` | CrazyGames portal | ZIP via `pnpm portal:package crazygames` | none | none | CrazyGames SDK v3 midgame on Play again |

## Features

`on` means the target's `config.ts` turns the feature on.

| Target | signIn | shop | duels | leaderboard | daily | levels |
|--------|--------|------|-------|-------------|-------|--------|
| `app` | on | on | on | on | on | on |
| `crazygames` | off | off | off | off | off | off |

The CrazyGames root renders `PortalApp` (Endless only) and never
imports the app's screens, so online features never ship in that bundle.

## Constraints per platform

**CrazyGames**
- No network calls except the CrazyGames SDK: no doomstack.lol, Firebase,
  Ably, Stripe or analytics. A new import in shared game code must not pull
  any of these in (`pnpm portal:package` fails the build if it does).
- Escape is never bound (the portal uses it to leave fullscreen).
- Opens straight on Start: no sign-in, splash, onboarding or external links.
- Best height is saved through the SDK's data module, falling back to
  localStorage.
- Must fit an 821x462 iframe and a 390x844 phone.
- Every SDK call is guarded: the game must run if the SDK is blocked.
- ZIP at most 50 MB, 20 MB or less for the mobile homepage, at most 1500 files,
  `index.html` at the root, relative asset paths.
- Call `gameplayStart`/`gameplayStop`, `loadingStart`/`loadingStop`, and
  `happytime` on a new best. No midgame ad in the first 3 minutes.

**App (iOS, Android, web)**
- iOS store rules: digital goods go through StoreKit; see
  `skills/mobile-release/SKILL.md` before a version bump or submission.
- The app is the only target with the full experience; new features land
  here first, then each other target turns them on in its `config.ts`.

## Checklist for a game change

1. Does it make a network call or import a module that does? CrazyGames breaks.
2. Does it bind a key (Escape especially) or change pause or audio? Check the
   CrazyGames adapter (`targets/crazygames/sdk.ts`).
3. Does it add assets? Check the CrazyGames ZIP limits.
4. Does it grant gems or anything paid? Every payment path (StoreKit, Stripe)
   credits server-side only.
5. Run both builds: `pnpm mobile:typecheck` and
   `pnpm portal:package crazygames` (CI builds both).
