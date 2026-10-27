# Platforms

Every place Doomstack ships. **Before changing the game, check each row below:**
a change that is fine in the app can break a portal (network calls, Escape,
size) or a host (Telegram, Discord). Add a row here in the same change that
adds a target.

One codebase builds one bundle per target: `pnpm mobile:build --mode <target>`
picks `app/mobile/src/targets/<target>/` (`config.ts` + `root.tsx`). The
feature table is checked against each `config.ts` by
`app/tests/targets/platformsDoc.test.ts`, so it cannot drift.

## Targets

| Target | Ships to | Build output | Sign-in | Payments | Ads | API |
|--------|----------|--------------|---------|----------|-----|-----|
| `app` | iOS and Android (Capacitor), web at doomstack.lol | `mobile/dist`, Xcode / Android Studio | Firebase: Apple, Google, email | iOS: StoreKit 2 gem packs. Android and web: Stripe Checkout | none | `https://www.doomstack.lol` |
| `crazygames` | CrazyGames portal | ZIP via `pnpm portal:package crazygames` | none | none | CrazyGames SDK v3 midgame on Play again | none |
| `youtube` | YouTube Playables | ZIP via `pnpm portal:package youtube` | none | none | none | none |
| `itch` | itch.io (HTML5 upload) | ZIP via `pnpm portal:package itch` | none | none | none | none |
| `telegram` | Telegram Mini App at `/play/telegram` | `app/public/play/telegram` (built by `pnpm build`) | Telegram initData, server-verified, Firebase custom token `telegram:<id>` | Telegram Stars invoices, credited by the webhook | none | same origin |
| `discord` | Discord Activity at `/play/discord` | `app/public/play/discord` (built by `pnpm build`) | Discord OAuth code exchange, Firebase custom token `discord:<id>` | Discord consumable SKUs | none | `/.proxy` (Discord URL mappings) |

## Features

`on` means the target's `config.ts` turns the feature on.

| Target | signIn | shop | duels | leaderboard | daily | levels |
|--------|--------|------|-------|-------------|-------|--------|
| `app` | on | on | on | on | on | on |
| `crazygames` | off | off | off | off | off | off |
| `youtube` | off | off | off | off | off | off |
| `itch` | off | off | off | off | off | off |
| `telegram` | on | on | off | on | on | on |
| `discord` | on | on | on | on | on | on |

Portals render `PortalApp` (endless Free Climb only) and never import the app's
screens. Telegram and Discord reuse the app shell, so a feature that is off
there is hidden at runtime by `targetConfig.features` (routes and entry
points), not removed from the bundle.

## Constraints per platform

**All portals (`crazygames`, `youtube`, `itch`)**
- No network calls except the portal's own SDK: no doomstack.lol, Firebase,
  Ably, Stripe or analytics. A new import in shared game code must not pull
  any of these in.
- Escape is never bound (portals use it to leave fullscreen).
- Opens straight on Start: no sign-in, splash, onboarding or external links.
- Best height is saved on the device through the platform adapter.
- Must fit an 821x462 iframe and a 390x844 phone.
- Every SDK call is guarded: the game must run if the SDK is blocked.

**CrazyGames**: ZIP at most 50 MB, 20 MB or less for the mobile homepage.
Call `gameplayStart`/`gameplayStop`, `loadingStart`/`loadingStop`,
`happytime` on a new best. No midgame ad in the first 3 minutes.

**YouTube Playables**: ZIP under 30 MB. Call `firstFrameReady` and
`gameReady`, honour host pause and `isAudioEnabled`, save through `saveData`.
Needs the Playables interest form approved.

**itch.io**: no SDK. The ZIP must have `index.html` at its root.

**Telegram**
- Runs only inside Telegram; outside it shows "Open in Telegram".
- Duels are off. Anything new that links to `/challenge` must check
  `features.duels`.
- Gem credits come only from the Stars webhook (`creditGemPack`, provider
  `telegram`), never from the client.
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

**Discord**
- Runs only inside Discord; every outbound host must go through a URL mapping
  (`targets/discord/urlMappings.ts`) and the `/play/discord` CSP
  (`targets/discord/hosting.cjs`). A new third-party host breaks Discord until
  both are updated and the mapping is added in the Developer Portal.
- Gem credits come only from the server checking the SKU entitlement.
- Env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`,
  `DISCORD_GEM_SKUS`, and `VITE_DISCORD_CLIENT_ID`, `VITE_DISCORD_GEM_SKUS`
  for the client build.

**App (iOS, Android, web)**
- iOS store rules: digital goods go through StoreKit; see
  `skills/mobile-release/SKILL.md` before a version bump or submission.
- The app is the only target with the full experience; new features land
  here first, then each other target turns them on in its `config.ts`.

## Checklist for a game change

1. Does it make a network call or import a module that does? Portals break.
2. Does it add a screen or a link to one? Gate it on `targetConfig.features`
   for Telegram and Discord.
3. Does it bind a key (Escape especially) or change pause/audio? Check the
   portal adapters.
4. Does it add assets? Check the portal ZIP limits.
5. Does it call a new third-party host? Add a Discord URL mapping and CSP entry.
6. Does it grant gems or anything paid? Every payment path (StoreKit, Stripe,
   Stars, Discord SKUs) credits server-side only.
7. Run all builds: `pnpm mobile:typecheck`, `pnpm mobile:build:hosted`, and
   `pnpm exec vite build --config mobile/vite.config.mts --mode <portal>`
   for each portal (CI runs all of these).
