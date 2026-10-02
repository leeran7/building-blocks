---
name: mobile-release
description: >-
  Use when shipping, submitting, or version-bumping the native iOS or Android
  app, preparing a TestFlight or Play build, or judging whether a mobile build
  is ready for store review.
---

# Mobile Release

A store build cannot be patched after it ships, and it talks to whatever
server is live. Work the sections in order. Prices, product ids and version
constants live in code: read them there, never copy them from a doc.

## 1. Version — four files move together

| File | Field |
|------|-------|
| `app/package.json` | `version` (`x.y.z`) |
| `app/src/lib/version.ts` | `APP_VERSION` |
| `app/android/app/build.gradle` | `versionName "x.y"`, `versionCode` +1 |
| `app/ios/App/App.xcodeproj/project.pbxproj` | `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` +1, in **both** build configurations |

`package.json` and `version.ts` take `x.y.z` (`2.1.0`); the two native files
take `x.y` (`2.1`). The build number rises on every upload, even when the marketing version does
not. Check all four with one command and read the output:

```bash
grep -nE '"version"|APP_VERSION =|versionCode|versionName|MARKETING_VERSION|CURRENT_PROJECT_VERSION' \
  app/package.json app/src/lib/version.ts app/android/app/build.gradle app/ios/App/App.xcodeproj/project.pbxproj
```

## 2. Notes

- `CHANGELOG.md`: move the `## Unreleased` entries under `## [x.y.z] - YYYY-MM-DD`.
- `docs/releases/v<x.y>-<slug>.md`: the pieces, their PRs, and the manual steps.

## 3. Server before the store build

1. Merge to the default branch. The production deploy applies migrations.
2. Probe the routes this release added (compare
   `grep -rhoE "/api/[A-Za-z0-9/_-]+" app/mobile/src | sort -u` with the same
   grep at the last release commit). A full path that answers `404` is not
   deployed; `401`, `200` or `405` means it is. A path ending in `/` is a
   prefix: append an id before probing.
3. **Exception:** a `DAILY_SIM_VERSION` or `LEVEL_SIM_VERSION` bump locks out
   installed builds the moment the server deploys. Use the `sim-change` skill
   and deploy when the store build is live.
4. Env while a build is in review (full table in `docs/deploy.md`):
   `APPLE_IAP_SANDBOX_UIDS` must hold the Firebase uid of App Review's demo
   account **before** the build is submitted. App Review buys in Sandbox; any
   other account is refused with `SANDBOX`, gets no gems, and the app
   finishes that transaction, so adding the uid afterwards does not credit it.

## 4. Store consoles — not checkable from the repo

Ask the owner to confirm each; report them as owner-only, never as passed.

- App Store Connect: one consumable per `GEM_PACKS` entry in
  `app/src/lib/gemPacks.ts`, id `appleProductId`, US price `appleUsdCents`.
- App ID capabilities: In-App Purchase, Sign in with Apple, Associated
  Domains, Push Notifications.
- Review demo account, screenshots, privacy labels, age rating.
- Play: confirm the way the Android Shop sells gems is allowed for digital
  goods before each submission.

## 5. Build

```bash
cd app && pnpm cap:sync && git status --short ios android
```

- `ios/App/CapApp-SPM/Package.swift` and `android/capacitor.settings.gradle`
  must point at the `@capgo+native-purchases` path containing `patch_hash=`.
  If sync changed them, commit them: the unpatched plugin finishes a StoreKit
  transaction before the server credits it.
- Confirm the patch is applied (expect `1`):
  `grep -c "Patched (building-blocks)" node_modules/@capgo/native-purchases/ios/Sources/NativePurchasesPlugin/NativePurchasesPlugin.swift`
- `ios/App/App/GoogleService-Info.plist` and `android/app/google-services.json`
  are not in git. Confirm both exist on the build machine.
- iOS: `pnpm cap:ios`, archive with the Release configuration. Android:
  `pnpm cap:android`, build a signed bundle.

## 6. Verdict

**REQUIRED SUB-SKILL:** when the Skill tool lists
`superpowers:verification-before-completion`, invoke it first.

Run the gates in `context/gates.json` and `pnpm mobile:build` fresh. A
readiness verdict is a table of every item above marked **checked** (with the
command and its output), **not checked**, or **owner-only**. "Ready" needs
zero items not checked.

## Common mistakes

| Mistake | Result |
|---------|--------|
| Bumping three of the four version files | Store rejects the upload, or the app reports the old version |
| Copying prices from a doc | App Store Connect products priced off the code's `appleUsdCents` |
| Store build before the server deploy | New screens 404 for every player |
| Demo account missing from `APPLE_IAP_SANDBOX_UIDS` | Reviewer's purchase fails; rejection |
| Not committing the files `cap:sync` rewrote | The next clean checkout builds the unpatched purchases plugin |
