# The Climb — iOS / mobile-alone launch spec

**Status:** ready for architect (`success`). Not blocked on a user decision.  
**Product:** The Climb (free endless climber at `/play` and `/climb` on https://www.doomstack.lol).  
**This file:** investigation spec. Do not use `loop/spec.md` (reserved, gitignored).  
**Out of this agent's hands:** stack, schema, and framework choices (architect).

---

## Recommendation (decisive)

| Question | Decision |
| --- | --- |
| Can v1 ship as a **phone product** without waiting on desktop polish? | **Yes.** Coarse-pointer play is launch-critical. Fine-pointer 9:16 play must not regress, but it is not a launch gate. |
| Launch vehicle: **Safari + Home Screen** vs App Store binary? | **Safari + Home Screen web app.** Ship a web app manifest, 180×180 PNG `apple-touch-icon`, and standalone display. Do **not** ship an App Store binary, Capacitor shell, React Native app, or WKWebView wrapper this cycle. |
| Does “the game alone” drop **paid stacks** from the mobile launch surface? | **Yes — hide in climb chrome, link out from the phone landing.** Stripe-bought altitude stays a web / fine-pointer business. No Apple IAP. Direct paid URLs keep working; they are not the phone home. |
| Is `/play` the mobile home? | **Yes as the advertised product URL.** Coarse-pointer `/` primary CTA is Play (`/play`). Do **not** HTTP-redirect all `/` traffic to `/play` (that would break desktop paid conversion and existing OG/share links). |
| One leaderboard or wait for PR #49? | **Require the PR #49 contract before calling mobile launch done.** Free climb splits into Mobile vs Desktop boards by **play surface** (not User-Agent). Mobile is the default write/read. Paid towers stay one ranking. Do not feature a mixed board as the phone product. |

**Why not App Store this cycle.** Verified in-tree: no Capacitor, no React Native, no Xcode project, no web app manifest, no `apple-touch-icon`, no service worker, no `apple-mobile-web-app-*` meta — only `app/app/icon.svg`. A thin WKWebView wrapper of doomstack.lol is routinely rejected under App Store Guideline 4.2. Putting Stripe-sold digital altitude inside an iOS app collides with Guideline 3.1.1. Google Sign-In as a primary login in an App Store app without Sign in with Apple collides with Guideline 4.8. Apple Developer Program ($99/year), TestFlight, screenshots, nutrition labels, and age rating are cost with no product unlock this cycle. iOS 26 already opens a Home Screen add as a standalone web app; a manifest still improves name, icon, and theme.

**Why phone-first is viable now.** Coarse-pointer already uses a full-bleed `fixed inset-0` stage (`ClimbScene`), fill-mode canvas (no 9:16 lock), overlaid touch controls, `viewport-fit: cover` + safe-area insets, iOS Silent Mode audio via a `playsinline` media element, and `signInWithRedirect` with the Firebase handler proxied onto www.doomstack.lol. Remaining work is product surface (home, chrome, install, share, legal, board split), not a native port.

---

## Goal

Ship The Climb as a **phone-installable web game** that a first-time iPhone user can open, add to the Home Screen, play in Silent Mode with on-screen controls, and rank on a **mobile** free-climb board — without presenting paid-stack checkout as the phone product, and without an App Store binary.

Success looks like: on an iPhone-class coarse-pointer viewport, the path from `https://www.doomstack.lol` to a running climb does not require a paid-stack account; `/play` is the advertised home; a Home Screen icon launches standalone at `/play`; scores from fill-stage play land on the Mobile board defined by the PR #49 contract.

---

## Scope

### In scope (this launch)

1. **Launch vehicle:** Home Screen / Safari web app on the existing public origin (`www.doomstack.lol`). Manifest (`display: standalone`, `start_url` that resolves to `/play`, theme/background `#0a0a0c`), PNG `apple-touch-icon` (180×180), and Apple web-app meta so the icon name is “The Climb” (or “Climb”), not a truncated paid-stack title.
2. **Device envelope (launch-critical):** iPhone Safari (portrait), iPhone Home Screen standalone. **Also in the same product (same ACs):** iPad when `(pointer: coarse)` (fill-stage, not 9:16); Android Chrome when `(pointer: coarse)` (must not regress). Play-surface detection stays **`(pointer: coarse)` + fill-stage vs keyboard / 9:16**, never User-Agent.
3. **Mobile home:** Advertised URL `/play`. Coarse-pointer `/` hero **primary** CTA goes to `/play` and is a ≥44×44 control. Navbar control labeled for free climb is **visible** on viewports below the `sm` breakpoint and hrefs `/play` (not `/#free`).
4. **Paid stacks on phones:** **Linked-out, not in climb chrome.** `/play` lobby, in-run HUD, and results must not offer buy-altitude / Stripe / `/submit` / “Enter the arena”. Coarse `/` may include one secondary text link to paid stacks (`/#towers` or `/browse`). Direct routes (`/stack/[category]`, `/submit`, Checkout) remain reachable and functional — they are not the launch surface.
5. **Chrome during play:** On coarse `/play`, site Navbar and Leaderboard/Play tabs must not steal canvas height and must not receive pointer events during an active climb (unmount or `inert` + `aria-hidden`). Escape to `/climb` remains available in lobby and results.
6. **Leaderboard:** Adopt the PR #49 contract (open, not merged as of 2026-08-31): free climb only; Mobile vs Desktop = fill-stage / coarse vs 9:16 / keyboard; Mobile default for `/climb`, landing free teaser, dashboard order, and omit-POST writes; untagged history → Desktop; one account may rank on both; invalid `board` → 400 `INVALID_BOARD`; paid towers remain a single ranking. If #49 is not merged, this launch **includes equivalent work** — it is not optional.
7. **Share:** After a run with a replay URL, use `navigator.share` when the API exists (iOS share sheet). Keep copy-link as the fallback when it does not.
8. **Install hint:** On coarse `/play` lobby, when `display-mode` is `browser` (not already standalone), show copy that includes the exact phrase `Add to Home Screen`. Hide that hint when `display-mode: standalone`.
9. **Legal routes:** `/privacy` and `/terms` return 200 and are linked from the landing footer and from `/play` (lobby or a persistent legal row). Required because Home Screen looks like an app and the product already collects Firebase Auth identifiers and climb peaks.
10. **Session quality:** Keep iOS Silent Mode audio path; `prime()` must run inside the Start climb gesture. Request Screen Wake Lock while the match phase is climbing; release on finish, lobby, replay-end, and `pagehide` / `visibilitychange` hidden.
11. **Auth (web):** Anonymous play with no login wall. Sign-in to persist rank: email/password + Google **redirect** (not popup). Pending-run stash then save after redirect remains required. Sign in with Apple is **not** required this cycle (web / Home Screen).
12. **Score envelope (interim trust):** Keep rejecting over-envelope `peakY` via the existing tick-bound (`MAX_ASCENT_SPEED_MPS` = 17.5 m/s). This launch **does not** close server-side re-simulation of peaks (F-1 / AC-17). See Risks and the trust decision below.
13. **QA matrix:** At least one automated browser project that is **WebKit** (not Chromium with an iPhone UA). The current Playwright `iphone-12` project is Chromium + iPhone UA and does **not** satisfy WebKit ACs.

### Out of scope (explicit non-goals)

- App Store binary, TestFlight, Apple Developer Program enrollment, smart app banner (`apple-itunes-app`), Capacitor, Cordova, React Native, Flutter, or any WKWebView wrapper of the website.
- Apple In-App Purchase, StoreKit, or moving Stripe altitude into the iOS app.
- Sign in with Apple (Guideline 4.8 only binds an App Store app).
- Service worker / offline play / “works in airplane mode”.
- Haptics, landscape lock, Game Center, push notifications, iCloud.
- Desktop visual polish, new paid-stack mechanics, `/api/tower` unscoped-contract rewrite, power-up one-slot vs stacking.
- Server-derived `peakY` from seed + input log (Future; F-1 stays open).
- Making `/play/[category]` a per-stack game (legacy route already redirects to `/play`).
- Changing the fine-pointer `/` paid-stack business or breaking Stripe Checkout on desktop.
- A separate Android Play Store listing.

### Assumptions

- Origin stays `https://www.doomstack.lol` (no `play.` subdomain this cycle).
- “Mobile” means play surface `(pointer: coarse)` + fill-stage, matching PR #49 — not a User-Agent parse.
- PR #49 remains the board contract even if the git branch name changes; the behaviour in Scope item 6 is load-bearing.
- iOS 26 Home Screen standalone-without-manifest is real; we still ship a manifest so icon, name, `start_url`, and theme are deterministic.
- Anonymous play stays allowed; rank persistence requires a Firebase user.
- Design tokens stay those in `app/DESIGN.md` (void `#0a0a0c`, signal `#cbf24d`). This spec does not restyle the desktop landing featured grid (7 cards vs older AC-27 “6 cards” is a separate landing-spec rewrite).
- Navbar “Free climb” already hrefs `/play` (`FREE_CLIMB_HREF`); the bug is **visibility** (`hidden sm:inline-flex`), not the destination.

### Constraints

- Do not choose a new application stack. This is a product launch of the existing public web game.
- Do not put irreversible `peakY` writes on an unbounded client field. Envelope reject is mandatory; re-sim is Future.
- Touch-reachable controls ≥44×44 CSS pixels. Do not use `text-muted` (`#74707e`, 4.11:1 on void) for body copy or control labels; use `text-secondary` or stronger (≥4.5:1).
- Unlock Web Audio from the real Start climb gesture; wrap node calls so an `InvalidStateError` cannot unmount the tree.
- Scope game key listeners to phases that consume input; skip `preventDefault` when the event target is a control (mute, Start, links).
- Middleware stays presence-only; authorization stays in route handlers.

### Trust decision (answers security-reviewer → product-spec)

**The free leaderboard is a trust boundary.** `peakY` is persisted with monotonic `Math.max`, rendered on public pages, and cannot be lowered. `scoreBounds` is a **damage cap**, not authentication of play. A single authenticated POST at the envelope can still take rank 1.

**This launch accepts that cap as an interim product control** (`MAX_ASCENT_SPEED_MPS` = 17.5, ~378 km at `MAX_RUN_TICKS`). It does **not** mark F-1 closed. Server-derived peaks (seed + input log) stay Future.

**Mitigation in this launch (not a substitute for re-sim):**

- Phone surface must **not** place free-climb ranks beside paid-stack altitude (coarse `/` may link out to paid stacks but must not show a combined paid+free ranking widget as the first screen).
- Over-envelope and tick-less POSTs are rejected and must not persist (AC-37, AC-38).
- Featured public board for the phone product is the **Mobile** board (PR #49), so poisoning is partitioned from historic 9:16 desktop scores.

---

## Personas

### Riley — first-time iPhone player

Riley hears “The Climb” and opens doomstack.lol on iPhone Safari, often with Silent Mode on. They have never bought a stack and will bounce if the first screen is a paid arena. They will Add to Home Screen if the game feels like an app. **Goal:** start a climb in one or two taps, play full-screen with thumbs, come back from an icon.

### Sam — returning climber

Sam already has a Firebase account (Google or email). They play on the train, care about rank on the phone board, and want to drop a replay into Messages. **Goal:** a finished run saves to the Mobile board; share uses the system sheet; sign-in after a guest run does not lose the peak.

### Alex — paid-stack buyer (desktop)

Alex uses a laptop to buy altitude on one of 74 category stacks via Stripe. They must not discover that phones “took over” the site and 302’d `/` to a game. **Goal:** fine-pointer `/` still sells stacks; Checkout still works; paid towers remain one ranking.

---

## Stories

Each story has a happy path and at least one failure case. Acceptance criteria are in the next section.

### US-1 — Phone home is The Climb

**As Riley, I want the first action on a phone to be playing The Climb, so that I am not funneled into buying altitude.**

- Happy: Coarse `/` shows a ≥44×44 primary CTA to `/play`. `/play` shows a climb canvas and Start climb. Free-climb nav is visible below `sm`.
- Failure: Primary CTA is “Enter the arena” / signup for paid stacks; “Free climb” is `display:none` on a 375px viewport.

### US-2 — Full-bleed touch climb without site chrome

**As Riley, I want the canvas and thumb controls to own the screen while I climb, so that Navbar and tabs do not shrink the stage or steal taps.**

- Happy: After Start climb on coarse `/play`, `[data-climb-surface]` fills the visual viewport width; ← → climb JMP are each ≥44×44; no horizontal overflow at 375×812.
- Failure: `FreeStackShell` Navbar + tab band remain hittable under/over the overlay; document scrolls horizontally; lobby copy tells touch players to use a desktop.

### US-3 — Home Screen install

**As Riley, I want an icon named for The Climb that opens the game standalone, so that I do not hunt through Safari tabs or land on the paid hero.**

- Happy: Manifest `start_url` resolves to `/play`, `display` is `standalone`, 180×180 PNG touch icon is linked; lobby tells a browser-mode phone to Add to Home Screen; that hint is absent in standalone.
- Failure: Home Screen opens `/` paid landing; only `icon.svg` exists; an `apple-itunes-app` banner appears.

### US-4 — Mobile vs desktop free boards

**As Sam, I want my phone peaks ranked against other fill-stage players, so that a 9:16 desktop sightline cannot buy rank on the phone board (and vice versa).**

- Happy: Omit/`null` board on POST writes Mobile; coarse `/climb` default view is Mobile; paid category towers remain a single ranking.
- Failure: Launch ships with one mixed free board; a Desktop-tagged row appears as Mobile rank 1; invalid `board` is silently coerced instead of 400 `INVALID_BOARD`.

### US-5 — Guest play, then save

**As Sam (or Riley before signup), I want to finish a climb without an account and save it after Google or email sign-in, so that Safari popup blockers and a login wall cannot kill the session.**

- Happy: Start climb works with no session cookie. Results offer Sign in. After redirect sign-in, the stashed peak persists if the envelope allows it. Unauthenticated POST returns `saved: false` and writes no rank.
- Failure: Google uses `signInWithPopup`; unauthenticated POST creates a ranked row; Start climb redirects to `/auth/signin` before play.

### US-6 — System share sheet

**As Sam, I want to share a replay through the iOS share sheet, so that I can send it to Messages instead of only X.**

- Happy: When `navigator.share` exists and a replay URL exists, the Share control invokes it with a URL containing `/play`.
- Failure: Share is offered when the run was too long to encode; missing `navigator.share` throws and hides Copy link.

### US-7 — Silent Mode audio and an awake screen

**As Riley, I want to hear the climb with the hardware switch on Silent and not have the phone sleep mid-run, so that a 30-second lock-screen is not a death sentence.**

- Happy: Start climb primes audio inside that gesture; while phase is climbing, a Screen Wake Lock is held; it is released on finish and when the tab hides.
- Failure: Wake Lock still held on the results overlay; `Permissions-Policy` disables `wake-lock`; audio `prime()` only runs from a `useEffect`.

### US-8 — Privacy and terms exist

**As Riley, I want to open Privacy and Terms from the phone game, so that a Home Screen app that collects an account is not a legal dead-end.**

- Happy: `GET /privacy` and `GET /terms` are 200; footer (and `/play` legal links) point at them; targets are ≥44×44 on 375px.
- Failure: Either route 404s (current tree has no privacy/terms page).

### US-9 — Desktop paid business intact

**As Alex, I want the laptop site to still sell stacks, so that a mobile-alone launch does not 302 my bookmark into a game.**

- Happy: Fine-pointer `/` primary CTA stays on the paid path; fine-pointer `/play` canvas is 9:16 (±0.02); Stripe Checkout still accepts a valid paid-stack session on desktop.
- Failure: All viewports redirect `/` → `/play`; fine-pointer play uses fill-stage; Checkout is removed or IAP-only.

### US-10 — Envelope is enforced (interim)

**As the operator, I want over-envelope climbs rejected, so that the Mobile board cannot be written with a single infinite `peakY` even though re-sim is not shipping.**

- Happy: A POST with `peakY` ≤ `maxReachablePeakY(ticks)` may persist for an authenticated user; above the envelope returns 4xx and does not persist.
- Failure: Missing `ticks` is accepted; NaN/Infinity persist.

---

## ACs

Numbered globally. qa-acceptance must be able to automate these without taste. Prefer invoking production units or HTTP/DOM; do not treat a source-text grep as the pass.

**Selectors used below**

- Climb stage: `[data-climb-surface]`
- Start / again: `button[data-game-control]` whose accessible name is `Start climb` or `Climb again`
- Touch pad: `[aria-label="Touch game controls"]` buttons
- Overflow: `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (tolerance 1px)

**Coarse viewport fixture:** CSS viewport 375×812, `matchMedia('(pointer: coarse)') === true` (Playwright `isMobile: true` plus that media, or WebKit iPhone device descriptor — **not** Chromium-only + UA string).

### US-1 Phone home

**AC-1.** Given a coarse-pointer 375×812 viewport, when Riley opens `/`, then a link or button whose accessible name matches `/play|start climb|play the climb|free climb/i` is visible, its box is ≥44×44 CSS pixels, and its `href` (if a link) is `/play` or a same-origin URL that 200s at `/play`.

**AC-2.** Given the same viewport, when Riley opens `/play`, then an element `[data-climb-surface]` is in the document, `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`, and a `Start climb` control exists with box ≥44×44.

**AC-3.** Given a 375×812 viewport, when Riley views the header on `/` or `/play` (lobby), then a control with accessible name matching `/free climb|play/i` that hrefs `/play` is visible (`getComputedStyle(el).display !== 'none'` and bounding box height > 0). (Today `Navbar` “Free climb” is `hidden sm:inline-flex`.)

**AC-4 (negative).** Given a coarse-pointer 375×812 viewport, when Riley opens `/play` in the lobby phase, then the lobby overlay does not contain an `a[href*="checkout"]`, an `a[href="/submit"]`, or a control whose accessible name matches `/enter the arena|buy altitude|claim your altitude/i`.

### US-2 Full-bleed play

**AC-5.** Given coarse `/play`, when Riley activates `Start climb` and the match is in the climbing phase, then `[data-climb-surface].getBoundingClientRect().width` is ≥ `window.innerWidth - 2`, and the site `nav` and the “Free stack sections” tablist are either absent or have `inert` / `aria-hidden="true"` and do not receive a click at their previous layout position (a tap at `(width/2, 20)` does not navigate to `/`).

**AC-6.** Given coarse `/play` in the climbing phase, when the touch pad is shown, then four controls exist with accessible names matching move-left, move-right, climb, and jump (current glyphs: ← → climb JMP), and each box is ≥44×44.

**AC-7 (negative).** Given coarse `/play` lobby, when the overlay controls guide is shown, then the document body text does not include the substring `use a desktop for the best experience`.

**AC-8.** Given coarse `/play` climbing, when `visualViewport` height changes by ≥50px (simulated chrome collapse), then `[data-climb-surface]` height is within 2px of the new `visualViewport.height` (fill-stage tracks the viewport; it does not stay locked to the first measure).

### US-3 Home Screen

**AC-9.** Given `GET` of the document at `/play`, when the HTML is parsed, then a `<link rel="manifest">` (or equivalent HTTP `Link`) points at a resource that JSON-parses with `display` exactly `standalone`, `start_url` that resolves to a URL whose pathname is `/play` on `https://www.doomstack.lol`, and `background_color` / `theme_color` equal to `#0a0a0c` (case-insensitive).

**AC-10.** Given `GET /play`, when the HTML is parsed, then a `<link rel="apple-touch-icon">` href returns **200** with `Content-Type` image/png and pixel size **180×180** (SVG-only `app/icon.svg` does not satisfy this AC).

**AC-11.** Given coarse `/play` lobby and `matchMedia('(display-mode: browser)')` is true, when the lobby is visible, then an element whose text content includes `Add to Home Screen` is visible. Given `matchMedia('(display-mode: standalone)')` is true, when the lobby is visible, then no visible element includes that phrase.

**AC-12 (negative).** Given `GET /` and `GET /play`, when the HTML is parsed, then there is **no** `<meta name="apple-itunes-app">` and no store badge linking to `apps.apple.com`.

### US-4 Boards (PR #49 contract)

**AC-13.** Given an authenticated POST `/api/climb/result` with a legal envelope payload and **omitted** `board` field, when the handler returns 2xx with `saved: true`, then the persisted row is on the **mobile** board (querying the Mobile list includes this `userId` / peak; the Desktop list does not unless a separate desktop write exists).

**AC-14.** Given `GET /climb` with no `board` query (or default tab), when the page renders, then the selected board control has accessible name matching `/mobile/i` (`aria-selected="true"` or equivalent), and the rows shown are Mobile-board rows.

**AC-15 (negative).** Given a user whose only stored peak is tagged **desktop**, when `GET /climb` default (Mobile) is rendered, then that peak does **not** appear as rank 1 on the Mobile list. (Untagged pre-migration history is Desktop per PR #49.)

**AC-16.** Given `GET` of a paid category tower (e.g. `/stack/{slug}` or `/api/tower/{slug}`), when rankings are returned, then there is **one** ranking list for that stack (no `board=mobile|desktop` split on paid towers).

### US-5 Guest play and auth

**AC-17.** Given no Firebase cookie and coarse `/play`, when Riley activates `Start climb`, then the location pathname remains `/play` (no navigation to `/auth/signin` or `/auth/signup` before the climb phase).

**AC-18.** Given an unauthenticated POST `/api/climb/result` with a legal envelope payload, when the handler responds, then JSON includes `saved: false` (or equivalent) and no new monotonic peak row exists for a user id.

**AC-19.** Given a finished guest run, when the results overlay is shown, then a Sign in link is present whose `href` includes `/auth/signin` and a `redirect` back to `/play`. After a successful email or Google **redirect** sign-in, a previously stashed legal run is POSTed once and then cleared from `sessionStorage` key `doomstack:pending-climb`.

**AC-20 (negative).** Given `/auth/signin` on a coarse viewport, when the Google control is activated, then the page does **not** open a new browsing context (`window.open` / popup). The next document URL is same-origin `/__/auth/...` or `accounts.google.com` via top-level navigation.

### US-6 Share

**AC-21.** Given results with a non-null replay URL and `navigator.share` defined, when Sam activates the primary Share control (accessible name matching `/share/i`, not “Share on X”), then `navigator.share` is invoked with an object whose `url` includes `/play` and a `text` or `title` that includes the integer peak metres.

**AC-22 (negative).** Given results with a **null** replay URL (encode failed / run too long), when the results overlay is shown, then no control invokes `navigator.share`, and the overlay includes the substring `too long to share` (current copy) or equivalent visible explanation.

**AC-23.** Given `navigator.share` is **undefined** and a replay URL exists, when Sam activates Copy link, then the clipboard write contains the replay URL (or the UI reports `Couldn't copy link` if the clipboard API is missing — it must not throw out of the tree).

### US-7 Audio and wake

**AC-24.** Given coarse `/play` lobby, when `Start climb` is activated, then audio `prime()` runs **synchronously inside that click/tap handler** (unit test the wired handler; a `useEffect` after rAF does not satisfy this AC).

**AC-25.** Given climbing phase, when Screen Wake Lock is available (`navigator.wakeLock.request`), then `wakeLock.request('screen')` has been called once for this run within 1s of entering the climbing phase.

**AC-26 (negative).** Given a run that then finishes (or `document.visibilityState` becomes `hidden`, or `pagehide` fires), when the results overlay is shown or the tab is hidden, then the Wake Lock sentinel is released (`released === true` or `wakeLock.request` count is matched by release) within 1s. A `Permissions-Policy` response header on `/play` must **not** include `wake-lock=()`.

### US-8 Legal

**AC-27.** Given `GET /privacy`, when the response is received, then status is 200 and the document contains headings (h1–h3) whose text includes `Data we collect`, `Authentication`, and `Climb scores` (exact strings).

**AC-28.** Given `GET /terms`, when the response is received, then status is 200 and the document contains an h1.

**AC-29.** Given 375×812 `/` footer and coarse `/play` lobby, when legal links are measured, then a link to `/privacy` and a link to `/terms` each have a box ≥44×44 (or a wrapping target that size).

**AC-30 (negative).** Given `GET /privacy` and `GET /terms`, when either is requested, then status is not 404.

### US-9 Desktop paid path

**AC-31.** Given a **fine** pointer (`matchMedia('(pointer: coarse)') === false`) and viewport ≥1024×768, when Alex opens `/`, then the primary (first in DOM among hero CTAs) link href is `/auth/signup` or `/#towers` (paid path), not `/play`.

**AC-32.** Given fine pointer `/play`, when the canvas is laid out, then `height / width` of `[data-climb-surface]` is within **0.02** of `16/9`.

**AC-33 (negative).** Given fine pointer, when Alex `GET /`, then the response is **not** a 3xx to `/play`. (Coarse `/` also must not hard-redirect; it restyles in place.)

**AC-34.** Given a valid desktop Checkout request for a paid stack (existing `/api/checkout` contract), when the session is created, then the handler still returns a Stripe URL (this launch must not delete Checkout). qa may reuse existing checkout tests.

### US-10 Envelope

**AC-35.** Given production `checkClimbResult` and `MAX_ASCENT_SPEED_MPS` imported from `scoreBounds` (do not re-implement), when `MAX_ASCENT_SPEED_MPS === 17.5` and `peakY <= maxReachablePeakY(ticks)` with finite non-negative ticks ≤ `MAX_RUN_TICKS`, then `{ ok: true }`.

**AC-36.** Given `checkClimbResult` with `ticks === null`, when invoked, then `{ ok: false }`.

**AC-37.** Given POST `/api/climb/result` with authenticated user, `ticks` = 60, and `peakY` = `maxReachablePeakY(60) + 10`, when the handler returns, then status is 4xx and no new peak row is stored.

**AC-38 (negative).** Given POST `/api/climb/result` with `peakY` 1e12 and **no** `ticks` / `finishedTick`, when the handler returns, then status is 4xx and nothing is persisted.

---

## NFRs

| ID | Requirement | Number |
| --- | --- | --- |
| NFR-1 | Touch targets | Every control that is hittable on coarse `/play` (Start, Climb again, touch pad, mute, Sign in, Share, legal links) has a CSS box **≥44×44**. |
| NFR-2 | Contrast | Body copy and control labels on void `#0a0a0c` are **≥4.5:1**. Do not use `#74707e` (`text-muted`) for those strings. Decorative glyphs may stay muted. |
| NFR-3 | WCAG | `/play` lobby, results, `/climb`, `/privacy`, `/terms` target **WCAG 2.1 AA**. The moving canvas itself is a game view; finish still updates an `aria-live` region (append a monotonic counter so a repeated height still announces). |
| NFR-4 | `/play` readiness | From a warm server, Slow 4G throttling, WebKit 375×812: `Start climb` is visible within **3.0s**. |
| NFR-5 | Result POST | Authenticated legal POST `/api/climb/result` returns 2xx within **2.0s** on staging (excluding human auth). Existing IP rate limit **60 / 60s**, fail-open on Redis outage, remains. |
| NFR-6 | Auth | Email/password, Google **top-level redirect**, anonymous play. Firebase handler stays first-party (`/__/auth` on www.doomstack.lol). No SIWA this cycle. |
| NFR-7 | Viewport matrix (must pass ACs) | WebKit iPhone **375×667**, **375×812**, **390×844**. Coarse iPad **768×1024**. Android Chrome Pixel-class **393×851** must not fail AC-2, AC-5, AC-6, AC-7 (non-blocking for iOS *launch comms*, blocking for merge). |
| NFR-8 | WebKit | CI includes a Playwright (or equivalent) project whose browser **is WebKit**. Chromium + iPhone UA is insufficient for AC-2/5/6/24. |
| NFR-9 | Safe area | With `viewport-fit: cover`, HUD content starts at y ≥ `env(safe-area-inset-top)`; touch pad padding-bottom ≥ `env(safe-area-inset-bottom)` (0 on devices without insets). |
| NFR-10 | Scale | No new capacity envelope. Leaderboard page size remains **top 50**. Manifest and icons are static. |
| NFR-11 | Motion | `prefers-reduced-motion: reduce` still disables non-essential motion (existing DESIGN.md rule). |
| NFR-12 | Permissions-Policy | `/play` must allow Screen Wake Lock (must not send `wake-lock=()`). Camera/mic/geo may stay disabled. |

---

## Risks

| ID | Risk | Why it matters | Mitigation in this spec |
| --- | --- | --- | --- |
| R-1 | App Store Guideline **4.2** | A thin WKWebView of doomstack.lol is routinely rejected. | Non-goal: no native wrapper this cycle. |
| R-2 | Guideline **3.1.1** | Digital goods (paid altitude, IAP-like boosts) inside an iOS app must use Apple IAP, not Stripe. | Paid stacks stay off the phone climb surface; Stripe remains web/desktop. No boosts-for-money in the climb. |
| R-3 | Guideline **4.8** | Google as primary App Store login without a hide-email equivalent (usually SIWA). | No App Store app; email/password already exists on web. SIWA is Future. |
| R-4 | iOS 26 Home Screen standalone default | A bookmark without a correct `start_url` becomes a chrome-less **paid** landing. | AC-9 `start_url` → `/play`; AC-11 install hint; AC-12 no store banner. |
| R-5 | Free-board poisoning (F-1) | Client `peakY` + `Math.max` is irreversible; featuring Mobile as the phone product raises the incentive. | Envelope ACs 35–38; F-1 remains open; no combined paid+free widget as phone first screen. |
| R-6 | PR #49 not merged | Mixed board makes fill-stage vs 9:16 unfair. | Launch **includes** the board contract (AC-13–16). |
| R-7 | Missing legal pages | Home Screen + Firebase + public ranks without `/privacy` is a policy/legal gap. | AC-27–30. Copy quality is compliance, not this spec. |
| R-8 | Playwright false greens | `iphone-12` is Chromium + UA; WebKit audio, standalone, share, and wake lock differ. | NFR-8. |
| R-9 | Icon asset | Only `icon.svg` exists; iOS Home Screen wants PNG 180. | AC-10. |
| R-10 | Safari redirect auth | Third-party cookies. | Already mitigated (`signInWithRedirect` + `/__/auth` proxy). Do not revert to popup. |
| R-11 | Wake Lock / audio policy | A future `Permissions-Policy` or autoplay change can silently disable both. | AC-24–26; NFR-12. |
| R-12 | `$99` + review time if someone “just wraps it” | Wasted cycle and 4.2/3.1.1 rejection. | Out of scope, recorded so architect does not “helpfully” add Capacitor. |
| R-13 | Desktop paid conversion | Restyling `/` on coarse must not 302 fine-pointer `/`. | AC-31, AC-33. |
| R-14 | Unstable Apple rules | IAP and 4.2 interpretations change. | Revisit only if product later chooses App Store (Future). |

---

## Open Questions

None are launch-blocking. Recorded for later humans:

1. **Legal prose** for `/privacy` and `/terms` (what to disclose beyond the required headings) — compliance / docs, not architect-blocking.
2. **`play.doomstack.lol` vs path `/play`** — assumed same origin (`www`) this cycle.
3. **When, if ever, to pay for Apple Developer Program** — only with a real native client, SIWA, no Stripe-in-app, and content that is not a website wrapper (Future).
4. **Power-up one-slot vs stacking** and **unscoped `/api/tower`** — still open in `loop/learnings.md`; **out of scope** here.
5. **Landing featured grid 7 vs documented 6** and body `#0a0a0c` vs old AC-32 `#0a0a0f` — qa-acceptance already filed; not part of this launch except that mobile `/` CTA changes (US-1).

---

## Future

- App Store or Play Store native client **only if** it is not a website wrapper (4.2), contains **no** Stripe digital goods (3.1.1), and ships Sign in with Apple if Google remains (4.8).
- Server re-simulation of `peakY` from seed + input log (close F-1 / ranked AC-17 for free play).
- `navigator.vibrate` / haptics, optional landscape lock, offline service worker, Game Center, push “beat your last peak”.
- Sign in with Apple on web (optional convenience, not a Home Screen requirement).
- iPad Split View / Stage Manager layout polish.
- Coarse `/` HTTP 302 to `/play` (rejected this cycle; revisit if phone bounce on `/` stays high).
- Combining Mobile and Desktop boards behind a handicap (rejected until optics match).

---

## Verified current gaps (tree, 2026-08-31)

Use as implementer starting inventory, not as ACs that “already pass”:

- No `manifest.webmanifest`, no `apple-touch-icon`, no service worker, no `apple-mobile-web-app` meta; only `app/app/icon.svg`.
- No Capacitor / RN / Xcode.
- Playwright `iphone-12`: viewport 375×812 + iPhone UA on **Chromium**, not WebKit. `mobile-chrome` is Pixel 5.
- Navbar “Free climb” / “Browse” / “Settings”: `hidden sm:inline-flex`.
- Landing hero primary CTA: `/auth/signup` “Enter the arena”; free climb is a muted secondary stat.
- `ClimbControlsGuide` keyboard path: “use a desktop for the best experience”.
- `ShareRun`: X intent + clipboard; no `navigator.share`.
- No `/privacy` or `/terms` routes.
- `FreeStackShell` always mounts Navbar + Leaderboard/Play tabs; coarse play uses `fixed inset-0 z-40` over them.
- No Screen Wake Lock; no haptics; no orientation lock.
- `POST /api/climb/result` is client `peakY` + `scoreBounds` (trust.md item 1).
- Open PR **#49** (not merged): mobile/desktop free boards; play-surface split; mobile default write/read.

---

## Handoff notes for architect

- Product vehicle is **web Home Screen**, not a new client. Do not introduce a native shell to “be helpful”.
- Board split is **in scope** even if PR #49 is still open — implement or merge equivalent.
- Do not pick a new DB, auth vendor, or hosting platform in that architecture.
- Wake Lock, manifest, and PNG icon are product requirements; library choice is yours.
- Keep paid Stripe flows on existing routes; do not add IAP “just in case”.
