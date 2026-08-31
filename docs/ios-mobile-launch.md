# The Climb on iOS and mobile alone

**Investigation only (2026-08-31).** This is the human-facing report. It does not ship a native app, a PWA, or privacy pages. Product code is unchanged. The next implementer loop starts from the spec linked below, not from this summary.

Hosting stays the existing Next.js app on Vercel (`app/`). Deploy steps are in [deploy.md](deploy.md).

---

## Recommendation

Ship The Climb as a **Safari + Add to Home Screen** web game on `https://www.doomstack.lol`. On phones, the climb surface is **game-only chrome**: `/play` is the advertised home, paid-stack checkout is linked out of that chrome, and Stripe stays a web/desktop business. **Do not submit an App Store binary this cycle.** **Do not HTTP 302 `/` to `/play`** — coarse-pointer `/` restyles in place with Play as the primary CTA; fine-pointer `/` still sells stacks. A Home Screen icon launches standalone at `/play` via a web app manifest (`start_url: "/play"`, `scope: "/"`). That is the smallest vehicle that puts a first-time iPhone player into a climb without Apple review, IAP, or Sign in with Apple.

---

## What “iOS and mobile alone” means

**Phone product now.** Launch-critical surfaces are iPhone Safari (portrait) and iPhone Home Screen standalone. iPad with `(pointer: coarse)` uses the same fill-stage ACs. Android Chrome on a coarse pointer must not regress, but it is not the iOS launch gate.

**Desktop 9:16 must not regress, and it is not the launch gate.** Fine-pointer `/play` stays a 9:16 framed stage. Fine-pointer `/` keeps the paid-stack primary CTA. Keyboard iPad (`pointer: fine`) is the desktop game, not the phone product.

**Paid stacks are linked out of climb chrome, not deleted.** Direct URLs (`/stack/[category]`, `/submit`, Checkout) still 200. Lobby, in-run HUD, and results on coarse `/play` must not offer buy-altitude, Stripe, `/submit`, or “Enter the arena.” Coarse `/` may keep one secondary text link to paid stacks.

**Stripe stays web/desktop.** No Apple In-App Purchase. No StoreKit. Altitude is not sold inside the phone game.

“Mobile” means **play surface** — `(pointer: coarse)` + fill-stage versus keyboard / 9:16 — never a User-Agent parse. That is also how the free leaderboard splits (PR #49).

---

## Why not the App Store this cycle

This section is an **engineering checklist, not legal advice.** App Store Review Guidelines **do not apply** to Safari or Add to Home Screen. They **do** apply the moment a binary is submitted. Source inventory: [loop/ios-mobile-launch-compliance.md](../loop/ios-mobile-launch-compliance.md).

A WKWebView / Capacitor wrapper of `doomstack.lol` fails **independently** on:

| Guideline | Collision in this tree |
| --- | --- |
| **4.2** Minimum Functionality (incl. 4.2.2 web clippings, 4.2.7(e) thin clients) | The product is already a website. A binary that primarily loads it is a repackaged site. |
| **3.1.1** In-App Purchase | Stripe Checkout sells digital altitude (`/submit`, `/api/checkout`). Multiplatform **3.1.3(b)** does not authorize Stripe inside an iOS app without IAP for the same digital items. |
| **4.8** Login Services | Google Sign-In is a named third-party login. An App Store app that offers it needs an equivalent that can hide the email — usually **Sign in with Apple**. Email/password does not satisfy that. There is no `AppleAuthProvider` in `app/`. |
| **5.1.1** Privacy | **5.1.1(i)** requires a privacy policy in-app and in App Store Connect. There is no `/privacy` route. **5.1.1(v)** requires in-app account deletion if the app creates accounts. `/settings` is display name + saved URLs only. Prisma `onDelete: Cascade` is not a user-facing deletion path. |

**A game-only remote WebView of `/play` still fails 4.2.** Stripping Stripe CTAs can drop **3.1.1**; it does not make a remote site into Minimum Functionality. **4.8** remains if Google stays. **5.1.1** remains if accounts exist.

There is no Capacitor, React Native, or Xcode project in the tree. Apple Developer Program ($99/year), TestFlight, nutrition labels, and age rating are cost with **no product unlock** this cycle. iOS 26 can open a Home Screen add as a standalone web app; a manifest is still required so name, icon, and `start_url` are deterministic.

If a store listing is a later goal, it is a **bundled** game-only client (not a live-site WebView), **no Stripe CTA**, and **either no Google or Sign in with Apple** — see [When App Store would be justified](#when-app-store-would-be-justified). Architecture stop-list: [loop/ios-mobile-launch-architecture.md](../loop/ios-mobile-launch-architecture.md) §5.

---

## What already works on iPhone

A player can finish a **portrait** climb after hydration **if they do not pinch, rubber-band, rotate, or let the screen sleep.** Share is clipboard / X-intent only. Google redirect is designed correctly and unproven on WebKit. This is playable enough to send `/play` to phones internally; it is not “The Climb on iOS.”

| Capability | Where it lives |
| --- | --- |
| Full-bleed fill canvas on coarse pointer (`fixed inset-0`, not 9:16) | `ClimbScene.tsx` (touch branch `fixed inset-0 z-40`); `useCanvasSize.ts` `fill: touchDevice` → `fillCanvas()`; framing dropped in `ClimbCanvas.tsx` |
| Safari URL-bar height + pinch-zoom guard on measure | `useCanvasSize.ts` listens to `visualViewport` resize; height/width ignore `scale !== 1` |
| Safe area (notch / Dynamic Island / home indicator) | `app/app/layout.tsx` `viewportFit: "cover"`; `useSafeAreaInsets.ts`; HUD / power-up strip / `TouchControls.tsx` padding; camera `bottomInset` |
| Touch holds (iOS compatibility click ~300 ms) | `TouchControls.tsx` + `touchHold.ts` (500 ms timestamp window, pointer capture, `touch-action: none`) |
| iOS Silent Mode audio (media channel, not ringer) | `audioOutput.ts`: `MediaStreamAudioDestinationNode` → hidden `playsinline` `<audio>`; `prime()` in the Start tap (`ClimbScene.handleStart` → `unlockAudio()`) |
| Google redirect + first-party `/__/auth` | `signInWithRedirect` in `app/app/auth/signin/page.tsx` (not popup); `app/next.config.js` rewrites `/__/auth/:path*` onto the Firebase handler on `www.doomstack.lol` |
| Anonymous play, no login wall | Start climb does not navigate to `/auth/signin`; unauthenticated POST returns `{ saved: false }` |
| Background gap clamp | `useClimb.ts` caps a lock-screen rAF gap at 0.25 s so lava does not fast-forward |

Verified absences (not “already works”): no `manifest.webmanifest`, no 180×180 PNG `apple-touch-icon` (only `app/app/icon.svg`), no service worker, no Screen Wake Lock, no `navigator.share`, no `/privacy` or `/terms`.

---

## Launch blockers

Engineering gaps **G1–G12** from the mobile specialist. One line each. Full analysis: [loop/ios-mobile-launch-mobile.md](../loop/ios-mobile-launch-mobile.md).

| ID | Symptom | Why it blocks |
| --- | --- | --- |
| **G1** | Document under the `fixed inset-0` stage still rubber-bands; Navbar, tabs, and the how-to card sit in normal flow behind the overlay. | A hold-to-move game cannot share the vertical axis with Safari overscroll. |
| **G2** | Navbar + Leaderboard/Play tabs stay in the DOM (and tab order); “Free climb” is `hidden sm:inline-flex`. | First-run iPhone is marketing chrome, not a game; VoiceOver lands on Sign in behind the stage. |
| **G3** | `useCoarsePointer` starts `false` (SSR) → framed 9:16, then jumps to fill. | The launch impression is a layout flash; a tap during the desktop frame remounts mid-countdown. |
| **G4** | Pinch / double-tap zoom the page; canvas stays unzoomed CSS size. | Accidental pinch is unrecoverable control loss until reload. |
| **G5** | Landscape `fillCanvas` is a short, wide world; HUD overlaps; notch moves to the side. | Rotation (common) is not a playable or fair Mobile-board sightline. |
| **G6** | No manifest, no 180 PNG touch icon, no `appleWebApp` metadata. | Home Screen is a Safari bookmark with a generic icon; `start_url` is not `/play`. |
| **G7** | No Screen Wake Lock; default auto-lock blanks the display. | Completing a climb requires the screen to stay awake; asking players to change Settings is not a launch. |
| **G8** | Share is X-intent + clipboard; no `navigator.share`; copy targets are 40 px. | iOS often rejects Clipboard; the native path is the share sheet. |
| **G9** | Playwright `iphone-12` is Chromium + iPhone UA; CI does not run Playwright; no WebKit project. | Calling iOS ready without WebKit (audio, visualViewport, rubber-band, hold-click) is unverified. |
| **G10** | Start unlocks audio, but music `start()` still runs from a `useEffect`; mute-at-mount can `ensureContext()` outside a gesture. | Silent first climb reads as a broken game when the hardware switch is already a support issue. |
| **G11** | Pending climb lives in `sessionStorage` only across Google redirect. | Climb → sign-in → rank is the retention loop; iOS may drop `sessionStorage` on the OAuth hop. |
| **G12** | iPad coarse fill hits the same HUD-scale overlap as G5; `pointer: fine` + trackpad gets desktop 9:16 and no touch bar. | Spec puts coarse iPad on the same ACs as iPhone; HUD overlap is a real miss, not polish. |

---

## Product contract for the next implementer loop

Acceptance criteria **AC-1 through AC-38 plus AC-8a** (landscape overlay) live in **[loop/ios-mobile-launch-spec.md](../loop/ios-mobile-launch-spec.md)**. That file is the contract. This report does not restate every AC.

Architecture (vehicle A, no second stack): [loop/ios-mobile-launch-architecture.md](../loop/ios-mobile-launch-architecture.md) — especially **§1** (vehicle), **§4** (what to add in `app/`), **§5** (App Store stop-list), **§12** (16 ADRs). Do not paste those ADRs into product copy; implementers read them there.

Load-bearing calls the next loop must not invert:

| Call | Why |
| --- | --- |
| **PR #49 board split is in-scope** | Free climb splits Mobile vs Desktop by **play surface** (fill-stage / coarse vs 9:16 / keyboard). Mobile is the default write/read. Untagged history → Desktop. Invalid `board` → 400 `INVALID_BOARD`. Paid towers stay one ranking. If #49 is not merged, this launch includes equivalent work (`0010`/`0011` or equivalent). Do not ship Home Screen chrome against a mixed free board. |
| **Manifest `scope: "/"` and `start_url: "/play"`** | **Do not scope the manifest to `/play`.** Auth is `/auth/*` and `/__/auth/*`; a `/play` scope ejects those navigations into Safari (different storage partition) and breaks Google return. Hide chrome with CSS/`inert`, not with a narrow scope. |
| **Dual-write pending-climb** | Same JSON to `sessionStorage` **and** `localStorage` under `doomstack:pending-climb`; **clear both** after one successful POST (AC-19). Allow-list fields only; 2h TTL; never stash JWT/Bearer; `safeInternalPath` on any stored redirect. No `pending_climbs` table in v1. |
| **Landscape = rotate overlay, not fill-stage** | Coarse landscape fill would still POST `board: mobile` and poison the phone board. Show a rotate-to-portrait overlay; do not run fill-stage or accept Start while width > height. Do **not** call `screen.orientation.lock` (out of spec; Safari will not grant it). |
| **`/privacy` and `/terms` in v1** | Home Screen looks like an app and the product already collects Firebase identifiers and climb peaks. Routes return 200; privacy headings include `Data we collect`, `Authentication`, and `Climb scores`. Copy quality is compliance; **the routes are in this launch**. |
| **WebKit Playwright** | Current `iphone-12` project is **Chromium + iPhone UA** (no `devices["iPhone 12"]` spread: no `hasTouch` / `isMobile`). That does **not** satisfy WebKit ACs. Add a real WebKit project. |
| **No 302 `/` → `/play`** | Coarse `/` restyles; fine `/` still sells stacks (AC-31, AC-33). |
| **Google stays top-level redirect** | No popup. No Sign in with Apple this cycle. |

Envelope (`MAX_ASCENT_SPEED_MPS` = 17.5) stays the interim damage cap. Server re-simulation of `peakY` (F-1) is **not** in this launch. The free leaderboard is still a trust boundary (`context/trust.md` §1).

---

## Cost

**Cheapest vehicle that launches the game on iPhone without a desktop is stay on Vercel.** Incremental spend versus today is static CDN bytes (touch icons, manifest) plus extra signed-in climb POSTs. Do not change host, payment processor, or auth provider to “save money.” Do not add Apple, IAP, or a second renderer to reduce spend — they only add meters. Full drivers: [loop/ios-mobile-launch-cost.md](../loop/ios-mobile-launch-cost.md).

**Apple Developer Program $99/year + IAP 15% / 30% is a worse processor than Stripe at the $5 listing floor** (`MIN_ENTRY_USD`). Stripe today is 2.9% + $0.30 = $0.445 on $5. IAP 15% is $0.75; IAP 30% is $1.50. IAP only “wins” on sub-~$3 tickets at 15%, which is not the listing SKU. A game-only binary that cannot buy altitude still pays $99/year, review, and wrapper work for **zero** incremental altitude revenue, and still hits the same Vercel origin for APIs.

**Anonymous play is $0 origin.** Guest finishes do not POST `/api/climb/result`; CPU is the phone. A signed-in finish is ~2 Redis commands + 1 Node invocation + 1 `climb_runs` INSERT (`replay_token` ≤ 32 KiB) + 2 ISR writes. Encode/decode is client-side. Firebase Google redirects bill **MAU** (50k free), not per bounce; iOS ITP retries spike **Vercel document loads**, not Firebase MAU.

Keep climb rate limit **fail-open** (60/min/IP). Do not fail-closed it to save Redis — that blocks free play on an Upstash blip. Do not start POSTing anonymous finishes without a platform cap in front (Vercel WAF).

**This report does not quote a monthly hosting guess.** Bills meter Edge Requests, function invocations, ISR writes, Redis commands, Neon storage, and Firebase MAU; without those counters a monthly number is fiction.

---

## When App Store would be justified

Pay $99/year + IAP haircut + dual payment rails **only when** at least one of these has a **measured** unit value greater than the extra take and the duplicated subsystems:

1. **Push (APNs)** — burial / overtaken / season events that email cannot replace, with conversion or retention that covers 15% of altitude GMV plus wrapper cost.
2. **Game Center** — a challenge graph the web `/climb` board does not provide, with evidence those users pay or retain more than Safari users by more than the IAP haircut.
3. **Conversion lift that beats the IAP haircut** — impulse checkout inside the binary whose extra tickets exceed +$0.305 per $5 (15%) or +$1.055 per $5 (30%). At today’s $5 floor, IAP is a worse processor unless it sells **more** tickets. App Store discovery only counts if organic CAC **after Apple’s cut** beats web CAC.

**And** the binary must be a **bundled** game (local sim + canvas, not a remote WKWebView of the live site), **no Stripe CTA** in the app, and **Sign in with Apple or no Google**. Architecture §5 is a hard stop-list: missing any item (3.1.1 path lock or IAP, 4.8, 4.2 differentiators, 5.1.1 policy + deletion) is a stop. That is a new product, not this cycle.

Until then, an App Store listing is a brand expense plus review risk, not a cheaper way to run The Climb on iPhone.

---

## Index

Specialist sources (evidence, not the reader entry):

| File | What it is |
| --- | --- |
| [loop/ios-mobile-launch-spec.md](../loop/ios-mobile-launch-spec.md) | Product contract — vehicle decision, US-1–10, **AC-1–38**, NFRs |
| [loop/ios-mobile-launch-architecture.md](../loop/ios-mobile-launch-architecture.md) | Vehicle **A**, 16 ADRs, data/API, App Store stop-list |
| [loop/ios-mobile-launch-mobile.md](../loop/ios-mobile-launch-mobile.md) | Client gap analysis **G1–G12**, what already works, device matrix |
| [loop/ios-mobile-launch-compliance.md](../loop/ios-mobile-launch-compliance.md) | App Store 3.1.1 / 4.2 / 4.8 / 5.1.1 checklist + PII inventory (not legal advice) |
| [loop/ios-mobile-launch-cost.md](../loop/ios-mobile-launch-cost.md) | Unit economics — stay on Vercel; no monthly hosting guess |

Related ops (unchanged by this investigation): [deploy.md](deploy.md), [runbook.md](runbook.md).

---

## Out of scope

Not this cycle (do not “helpfully” add them):

- **Capacitor**, Cordova, WKWebView wrapper, `ios/`, IPA, TestFlight, smart app banner (`apple-itunes-app`)
- **Native rewrite** (Swift/SpriteKit, Unity) or a second game engine
- **Service worker / offline** play / airplane mode
- **Sign in with Apple**
- **Apple In-App Purchase** / StoreKit / moving Stripe altitude into an iOS app
- Android Play Store / TWA listing in the same cycle
- Game Center, APNs / push, haptics, Orientation Lock API, iCloud
- Server-derived `peakY` re-simulation (F-1)
- Power-up one-slot vs stacking; unscoped `GET /api/tower` rewrite
- Changing the fine-pointer `/` paid-stack business or breaking desktop Checkout
