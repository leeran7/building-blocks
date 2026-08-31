# iOS / mobile-alone launch — mobile specialist gap analysis

Investigation only. No application code. Parent: investigation of launching
The Climb on iPhone/iPad as the **existing web game** at `/play` (coarse-pointer
full-bleed stage). Not a native App Store binary, not Capacitor.

Read against HEAD of this tree. Line numbers are that snapshot.

**Scope of “the mobile client”:** `ClimbScene` + `useCanvasSize({ fill })` +
`TouchControls` on `(pointer: coarse)`, framed by `FreeStackShell` / `PlayShell`
on `/play`. That is the tree to match. There is no separate React Native / Swift
tree.

**Alignment with `loop/ios-mobile-launch-spec.md`:** Product-spec already chose
Safari + Home Screen (not App Store), `/play` as the advertised home, and
`(pointer: coarse)` as the play-surface test. This file is the **engineering
gap list** against that vehicle. It does not reopen the vehicle decision. Where
spec and code disagree on difficulty (iPad HUD, landscape, rubber-band), the
code wins as a blocker even if spec called the item “remaining product surface.”

---

## What already works

These are iOS-specific (or iOS-first) engineering already in the web client.

### 1. Full-bleed coarse-pointer stage

On a coarse pointer, the scene is a viewport overlay, not a 9:16 column:

```269:274:app/src/components/Game/ClimbScene.tsx
    <div
      className={
        touchDevice
          ? "fixed inset-0 z-40 bg-void"
          : "flex flex-col items-center gap-4 w-full"
      }
```

`useCanvasSize` is called with `fill: touchDevice` (`ClimbScene.tsx:99`). Fill
mode matches the device aspect and ignores the desktop 9:16 lock / max width:

```33:41:app/src/hooks/useCanvasSize.ts
    const next = fill
      ? fillCanvas({
          availableWidth: viewportWidth(),
          availableHeight: viewportHeight(),
        })
```

Canvas framing is dropped on that path (`ClimbCanvas.tsx:92–96`, `432–434`).

### 2. `visualViewport` (Safari chrome) + pinch-zoom guard on the *measure*

Safari’s collapsing URL bar changes usable height. The hook listens to
`visualViewport` resize and `orientationchange` (`useCanvasSize.ts:65–68`).
Height/width ignore a pinch-zoomed visualViewport so a scale≠1 does not shrink
the game to a stamp:

```127:137:app/src/hooks/useCanvasSize.ts
function viewportHeight(): number {
  const vv = window.visualViewport;
  return vv && vv.scale === 1 ? vv.height : window.innerHeight;
}
```

### 3. Safe area (notch / Dynamic Island / home indicator)

Root layout sets `viewportFit: "cover"` so `env(safe-area-inset-*)` is non-zero
on notched iPhones (`app/app/layout.tsx:40–47`). `useSafeAreaInsets` probes those
values (`app/src/hooks/useSafeAreaInsets.ts:6–16`, `26–69`).

Consumers:

- Canvas HUD pushed below the top inset (`ClimbCanvas.tsx:97–102`, `372–390`;
  `ClimbScene.tsx:350`).
- Power-up strip padded by top + approximate HUD bar + left/right insets
  (`ClimbScene.tsx:311–317`).
- Touch bar uses `env(safe-area-inset-*)` padding (`TouchControls.tsx:83–90`).
- Camera `bottomInset` includes `max(TOUCH_CONTROLS_MIN_BOTTOM, safeArea.bottom)`
  so the climber is not drawn under the buttons (`ClimbScene.tsx:118–121`).
- Theme colour `#0a0a0c` matches the void canvas (`layout.tsx:45`).

### 4. Hold controls (iOS compatibility click)

On-screen ← → ↑ JMP, `min-h-[104px] min-w-[44px]` (`TouchControls.tsx:126–129`).
Pointer capture + `pointerup` / `pointercancel` / `lostpointercapture` release
(`144–153`). `touch-action: none` on the bar and each button (`84`, `125`).
`visibilitychange` / `pagehide` reset so a finger-down across lock does not
stick the climber walking (`TouchControls.tsx:60–72`).

Hold reducer uses a **500 ms timestamp window**, not a microtask, because iOS
fires the compatibility click in a later task (~300 ms historically)
(`touchHold.ts:9–16`, `71–78`; tests in `app/tests/game/touchHold.test.ts:38–57`).

`TOUCH_CONTROLS_INSET = 112` is breakpoint-free so tablet/landscape cannot
understate the overlay (`TouchControls.tsx:219–230`). Camera/audio treat lava
behind that overlay as not “on screen” (`climbCamera.ts:10–12`,
`app/tests/game/climbCamera.test.ts:52–56`).

### 5. iOS audio routing (ringer vs media) + gesture unlock

Bare Web Audio on iOS plays on the **ringer** channel and is silenced by the
Ring/Silent switch. `createAudioOutput` reroutes through a
`MediaStreamAudioDestinationNode` → hidden `playsinline` `<audio>` on touch
devices so playback is a media session (`audioOutput.ts:3–16`, `42–84`).
`prime()` resumes the context, starts a one-sample silent buffer (WebKit will
not open output on `resume()` alone), and `play()`s the element
(`audioOutput.ts:28–40`, `79–83`). Both `PowerUpAudio` and `ClimbMusic` use it
(`powerUpAudio.ts:546–549`, `climbMusic.ts:243–246`). `webkitAudioContext` is
the constructor fallback (`powerUpAudio.ts:534–537`).

`handleStart` calls `unlockAudio()` **inside the Start tap** before `start()`
(`ClimbScene.tsx:196–204`). Unmute also unlocks (`usePowerUpFeedback.ts:138–145`).
Replay auto-start does **not** create a context (`ClimbScene.tsx:122–126`,
`139–141`; `playDeath` / `playLavaSting` read `this.ctx` only,
`powerUpAudio.ts:266–279`). Backgrounded music scheduler snaps `nextStepTime`
instead of dumping past-due notes (`climbMusic.ts:134–140`).

Long-press callout/selection on the play surface is suppressed
(`app/app/globals.css:75–86`). Canvas `touchAction: "none"` (`ClimbCanvas.tsx:436`).

### 6. Google sign-in is redirect, same-origin auth handler

Popup OAuth is intentionally not used on mobile:

```182:183:app/app/auth/signin/page.tsx
  // Google sign-in uses full-page REDIRECT (not popup): more robust (no popup
  // blockers / COOP / mobile issues). The result is handled on return below.
```

`/__/auth` is rewritten onto the product origin so `authDomain` can be first-party
and Safari third-party-cookie / ITP breakage is avoided (`app/next.config.js:59–68`).
Sign-in after a run writes `sessionStorage["doomstack:pending-climb"]` and
redirects to `/auth/signin?redirect=/play` (`ClimbScene.tsx:425–438`). On return,
a signed-in non-anonymous session posts the stash (`ClimbScene.tsx:244–266`).
The climb route self-heals `users` for Google (`app/app/api/climb/result/route.ts:136–147`).

### 7. Other mobile-relevant behaviour that is already correct

- Fixed-timestep rAF loop clamps a backgrounded-tab gap to 0.25 s so a lock
  screen does not fast-forward lava by minutes (`useClimb.ts:206–217`).
- Device pixel ratio clamped to 2 so a 3× iPhone does not allocate a 2.25×
  backing store (`canvasBacking.ts:13–23`).
- Mute control is 44×44 (`PowerUpHud.tsx:96–102`). Start climb is `min-h-[60px]`
  (`ClimbScene.tsx:515`). Free-stack tabs are `min-h-[44px]` (`FreeStackShell.tsx:81–84`).
- `html { -webkit-text-size-adjust: 100% }` (`globals.css:42–45`) stops iOS from
  inflating text and blowing the HUD.
- Anonymous play without an account is allowed; save is opt-in after the run.

---

## Launch-blocking gaps

Must fix (or explicitly accept) before calling an iOS / “mobile alone” launch
ready. Each item was verified against the tree — not invented.

### G1. Document under the `fixed inset-0` stage still scrolls (rubber-band)

**Symptom on device:** During lobby / climb / results, the player can still
rubber-band the page. Safari overscroll reveals Navbar, Leaderboard/Play tabs,
and the `PlayShell` “how to play” card sitting in normal document flow behind
the overlay. A vertical swipe that misses a hold button (or a swipe on the
lobby overlay) moves the document. Controls and the canvas can fight the
scroll.

**Files:**

- `FreeStackShell` is explicitly **not** a fill-viewport `overflow-hidden`
  stage (`FreeStackShell.tsx:5–8`, `:27` `min-h-screen`, `:49–53` play panel
  still in-flow). Contrast: paid `CategoryShell` already has
  `h-[100dvh] … overflow-hidden` when `fill` (`CategoryShell.tsx:41–43`).
- `PlayShell` always renders a max-width how-to card **under** `ClimbScene`
  (`ClimbPlayClient.tsx:89–109`). On coarse pointers `ClimbScene` is `fixed`
  (`ClimbScene.tsx:271–273`), so that card is the in-flow height that makes
  the document scrollable.
- `body` is only `overflow-x: hidden` (`globals.css:47–51`). No
  `overscroll-behavior`. Overlay itself is `overflow-y-auto`
  (`ClimbScene.tsx:500`) — nested scroll + document scroll.

**Why it blocks:** A hold-to-move game cannot share the axis with document
scrolling. This is the classic iOS Safari “position:fixed page still bounces”
failure.

**Design-level fix:** When the coarse-pointer stage is mounted, make `/play` a
single non-scrolling viewport (`100dvh` / `100svh` + `overflow: hidden` +
`overscroll-behavior: none` on `html/body` or the shell). Do not leave Navbar,
tabs, or `PlayShell` copy in the layout box (unmount, `inert` + `aria-hidden`,
or take them out of flow). Keep overflow only on the results overlay, padded
with safe-area insets. Copy the `CategoryShell` fill contract; do not invent a
second shell.

### G2. Navbar + tabs still in the DOM under the overlay (first paint and AT)

**Symptom:** After hydration, `z-40` covers `Navbar` (`z-30`, `Navbar.tsx:40`)
and the tablist, but they remain in the accessibility tree and tab order.
Before hydration (see G6) they are fully visible as the “page around the
game.”

**Files:** `app/app/play/page.tsx:26–29` always wraps in `FreeStackShell`;
`FreeStackShell.tsx:26–47` always paints Navbar + tabs. Navbar “Free climb”
is `hidden sm:inline-flex` (`Navbar.tsx:73–76`), so on an iPhone-width
viewport that control is not visible even before the overlay covers it —
phones in the site chrome only see Sign in / Get started.

**Why it blocks:** First-run iPhone visit is not a game; it is the marketing
chrome plus a 9:16 card, then a jump. VoiceOver can land on “Sign in” / tabs
behind the stage. Spec already requires the Free climb nav control visible
below `sm` and href `/play`.

**Design-level fix:** `/play` on coarse pointer is a game-only chrome: no
site navbar, no Leaderboard/Play tabs in the overlay path. Provide in-game
exits (already: leaderboard `Link` on lobby/results). Keep the shell for
`/climb` (leaderboard) only.

### G3. `useCoarsePointer` starts `false` (SSR) → desktop 9:16 then jump to fill

**Symptom:** First paint (SSR + first client render) is the framed 360×640
column (`useCanvasSize.ts:99–100` `BASE_SIZE`) inside the scrolling shell.
After `useEffect` reads `(pointer: coarse)`, layout flips to `fixed inset-0`
fill (`useCoarsePointer.ts:7–17`). On a slow network this is a full layout
flash; a tap on Start during the desktop frame then remounts into full-bleed
mid-countdown.

**Why it blocks:** The first session on iPhone is the launch impression. A
hydration mismatch / delayed fill also means Playwright “mobile” polls can
pass on `BASE_SIZE` before measure (already a ledger finding).

**Design-level fix:** Do not wait on a client effect to choose the stage.
Options (pick one): (a) CSS `@media (pointer: coarse)` full-bleed wrapper so
the first paint is already fill, with `suppressHydrationWarning` on the
dimensioned canvas; (b) a tiny inline script that sets a class on `<html>`
from `matchMedia` before React; (c) iPhone UA cookie set from middleware for
SSR. Do not default `useState(false)` for a load-bearing layout bit.

### G4. Pinch zoom and overscroll fight the game

**Symptom:** Two-finger pinch on HUD / overlay / empty chrome zooms the page.
`fillCanvas` then ignores the zoomed visualViewport (`scale !== 1` →
`innerHeight`) so the canvas stays unzoomed CSS size while Safari scales the
document — the stage and the page disagree. Double-tap zoom similarly.

**Files:** Root `viewport` sets only `themeColor` and `viewportFit`
(`layout.tsx:44–47`) — `userScalable` stays default true. `touch-action: none`
exists on canvas + touch bar only, not on Overlay, PowerUpHud, or the page.
No `touch-action: manipulation` / no `overscroll-behavior` on `html`.

**Why it blocks:** Accidental pinch mid-climb is an unrecoverable control loss
until reload. Disabling zoom site-wide is an a11y tradeoff; it must be scoped
to `/play`.

**Design-level fix:** On the play route only: `touch-action: none` (or
`manipulation`) on the stage root; `overscroll-behavior: none`; consider
`viewport.maximumScale` **only** on `/play`, not the whole app. Keep Dynamic
Type elsewhere.

### G5. Landscape fill is a different, often unplayable game

**Symptom:** `fillCanvas` uses the full viewport with **no aspect lock**
(`useCanvasSize.ts:175–191`). iPhone landscape is wide and short. Visible
tower metres = `(height/width)*tower.widthM` (`climbCamera.ts:19–26`), so
look-ahead collapses (order-of-magnitude less world than portrait). Touch
bar is still ~112 px + safe area (`TOUCH_CONTROLS_INSET`). Canvas HUD height
scales with `width/360` (`ClimbCanvas.tsx:156`, `377`) while the overlaid
power-up strip assumes a constant `MOBILE_HUD_BAR_PX = 40`
(`ClimbScene.tsx:70`, `314`) — on landscape (and iPad) the on-canvas HUD is
taller than 40 px and the strip overlaps it. Notch moves to the side;
`hudInsetTop` only uses `safeArea.top` (`ClimbScene.tsx:350`), so altitude
text can sit under the island in landscape.

Safari tabs **cannot** `orientation.lock`. Spec lists “landscape lock” as out
of scope (no `screen.orientation.lock`). That does not make landscape *playable*.

**Why it blocks:** Rotating the phone (common) does not give a playable HUD
or fair look-ahead vs the portrait leaderboard. A launch that only tested
portrait will look broken the first time someone rotates.

**Design-level fix:** Do not ship an Orientation Lock API (out of spec). Either
(1) a CSS/JS “rotate to portrait” **pause overlay** (not a lock), or (2)
letterbox a 9:16 play surface inside the landscape viewport (reuse `fitCanvas`,
do not `fillCanvas`). Apply HUD offset from the **scaled** canvas HUD, not a
40 px constant. Add left/right safe-area to the on-canvas HUD, not only top.

### G6. No Web App Manifest / apple-touch-icon / standalone

**Symptom:** Add to Home Screen is a Safari bookmark: Safari chrome, no
standalone display, generic or SVG-less icon. There is `app/app/icon.svg`
only. No `apple-icon.png`, no `manifest.webmanifest`, no `appleWebApp` /
`apple-mobile-web-app-capable` metadata (repo grep is empty).

**Why it blocks:** Product-spec already chose Safari + Home Screen as the v1
vehicle (`loop/ios-mobile-launch-spec.md`). Without a manifest + 180×180 PNG,
Add to Home Screen is a Safari bookmark (unstable chrome, generic icon).
`themeColor` alone is not enough. iOS 26 may open a Home Screen add as
standalone even without a manifest; we still need name, icon, and `start_url`.

**Design-level fix:** Next.js `metadata.manifest` + `appleWebApp: { capable:
true, statusBarStyle: "black-translucent" }`, a PNG `app/apple-icon.tsx` (Apple
does not use SVG for home-screen icons), and `display: standalone` /
`orientation: portrait` in the manifest. Scope start_url to `/play`. This is
the install vehicle; not a second client.

### G7. Screen can sleep mid-run (no Wake Lock)

**Symptom:** Default iOS auto-lock (often 30 s–2 min) blanks the screen during
a climb. rAF pauses; on unlock the sim only catches up 0.25 s (`useClimb.ts:216–217`)
so it is not an instant lava death, but the player has left the gesture,
AudioContext is often suspended, and Safari may discard the tab under memory
pressure (full reload → lobby, run gone). There is no `navigator.wakeLock`.

**Why it blocks:** Completing a climb on a phone requires the display to stay
awake. Asking players to change Settings is not a launch strategy.

**Design-level fix:** Request `navigator.wakeLock.request("screen")` from the
same Start tap that unlocks audio; release on results / hide / unmount;
re-request on `visibilitychange` when a run is live. Supported in Safari
16.4+. If `wakeLock` is missing, show a one-line “keep the screen on” note
rather than failing silent. Permissions-Policy currently does not deny it
(`next.config.js:20`).

### G8. Share: clipboard-only + no `navigator.share` + 40 px targets

**Symptom:** Results offer “Share on X” (intent URL) and “Copy link”
(`ShareRun.tsx:29–76`). Copy is `navigator.clipboard.writeText` with no
`navigator.share`, no visible URL fallback, toast “Couldn't copy link” on
failure (`ShareRun.tsx:37–38`). Buttons are `min-h-[40px]` (`ShareRun.tsx:63`,
`72`) — under the 44 px floor in `DESIGN.md` and the ledger a11y rule. The
“Sign in to save” control is a `text-xs` inline link (`ClimbScene.tsx:426–441`).
Toast sits `bottom-6` (`Toast.tsx:21`) — on a notched phone it can collide
with the home indicator / JMP row.

iOS Safari often rejects Clipboard API even inside a click (no prompt, fails
the promise), especially before a prior permission / in some WebView-like
contexts. The native path is the share sheet.

**Why it blocks:** The launch loop is climb → share → sign-in. Copy failure
with no sheet and no selectable URL means share did not happen. X-intent is
only a Twitter/X fallback, not iOS share.

**Design-level fix:** On the Copy/Share tap (same user gesture): try
`navigator.share({ url, text })` first; fall back to clipboard; fall back to
a selectable `<input>` with the URL. Make both actions ≥44×44. Move the toast
above the safe-area + touch inset. Make “Sign in to save” a 44 px button, not
inline `text-xs`.

### G9. Playwright never runs WebKit; `iphone-12` is a Chromium UA spoof

**Symptom:** CI does not run Playwright (`.github/workflows/ci.yml` is vitest
only). Config:

```14:30:app/playwright.config.ts
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    {
      name: "iphone-12",
      use: {
        viewport: { width: 375, height: 812 },
        userAgent: "Mozilla/5.0 (iPhone; …) Safari/604.1",
      },
    },
  ],
```

`iphone-12` does **not** spread `devices["iPhone 12"]`: no `hasTouch`, no
`isMobile`, no `deviceScaleFactor`, `browserName` remains Chromium.
`(pointer: coarse)` follows the emulator’s touch capability, not the UA, so
this project likely paints the **desktop** framed stage. Pixel 5 is the only
touch project — still Blink. `freeClimb.spec.ts` was deleted (ledger
2026-08-29). `fillCanvas` has **zero** unit tests (`canvasSize.test.ts`
imports only `fitCanvas`; repo grep of `fillCanvas` is the hook file alone).

**Why it blocks:** Calling iOS launch “ready” without WebKit (audio routing,
visualViewport, safe-area, rubber-band, hold-click delay) is unverified. The
named iPhone project does not even exercise the coarse-pointer tree.

**Design-level fix:** Add a Playwright `webkit` project using
`devices["iPhone 12"]` / `iPhone 14` (hasTouch + isMobile + dpr). Assert
`pointer: coarse` → `data-climb-surface` fills the viewport, document
`scrollHeight` ≈ `innerHeight`, Start is tappable, no pinch target on the
stage. Unit-test `fillCanvas` (positive sizes, zero/NaN → `BASE_SIZE`,
orientation boxes). Put a thin webkit smoke in CI; keep a human iPhone Safari
pass as the real gate (see device matrix).

### G10. Audio: Start unlock is in tree; first cue can still be silent

**Symptom (residual, not the Aug 29 “Start never unlocks” bug):** Unlock *is*
on the Start click (`ClimbScene.tsx:196–197`). Music `start()` still runs from
a `musicActive` **effect** (`usePowerUpFeedback.ts:80–84`), i.e. after the
gesture. `ClimbMusic.start()` calls `prime()` again (`climbMusic.ts:97–102`)
outside the gesture. If the in-gesture `unlock()`/`prime()` failed (or iOS
suspended the context on an interruption), later `play()` / `ensureContext()`
from rAF/effects will not satisfy WebKit. Saved mute at mount calls
`PowerUpAudio.setMuted` → `ensureContext()` outside a gesture
(`powerUpAudio.ts:196–207`, `usePowerUpFeedback.ts:46–57`).

**Why it blocks:** Silent first climb = “broken game” on a phone with the
hardware switch already a known support issue. The ringer-routing work is
wasted if the context is still suspended.

**Design-level fix:** Keep creating the graph only in `unlock()` / `prime()`
from Start and unmute (already the intent). Have `musicEngine.start()` from
`handleStart` (same stack as `unlockAudio`), not from the phase effect — or
no-op `start()` until `ctx.state === "running"`. Stop `setMuted(true)` from
constructing a context at mount (music already avoids that;
`climbMusic.ts:60–65`). Wrap as today in try/catch.

### G11. Pending climb in `sessionStorage` after Google — likely, not proven

**Symptom to verify on device:** Finish unsigned → Sign in → Google redirect
→ back to `/play` with the run saved.

**What the code does:** Stash key `doomstack:pending-climb` in sessionStorage
on finish (no token) and again on the Sign-in click (`ClimbScene.tsx:233–237`,
`429–437`). Restore only when `user && token && !user.isAnonymous`
(`244–266`). Google return uses `getRedirectResult` then
`router.push(redirectTo)` (`signin/page.tsx:195–204`) with
`redirectTo` from `?redirect=` (`146`). Same-origin `/__/auth` proxy is the
Safari-correct setup (`next.config.js:59–68`).

**Risks (not confirmed bugs):**

- If Google returns to `/auth/signin` **without** `?redirect=/play`,
  `safeInternalPath` falls back to `/dashboard` (`signin/page.tsx:146`,
  `safeRedirect.ts:11`). Stash remains until the user happens to open `/play`.
- iOS Safari has a history of wiping or partitioning `sessionStorage` across
  a cross-site OAuth hop. Same-origin authDomain makes this less likely; there
  is no `localStorage` TTL backup.
- “Continue as guest” is anonymous: stash is ignored (`ClimbScene.tsx:245`);
  the results UI treats `user` as signed-in and can show “Couldn’t save”
  (`401–423`). Not iOS-specific, but it is the other button on the same
  screen.

**Why it can block:** Climb → sign-in → rank is the retention loop. A lost
stash is a silent drop.

**Design-level fix:** Persist `{ run, redirectTo }` in `sessionStorage` **and**
`localStorage` with a short TTL before `signInWithRedirect`. On every auth
landing page, read redirect from storage if the query is missing. Do not treat
guest as a save path (copy already says sign in). Prove with a WebKit e2e that
round-trips storage across a same-origin navigation, plus one human Google
pass on iPhone Safari.

### G12. iPad: coarse → full bleed; `pointer: fine` → desktop; split-screen untested

**Symptom:** iPad with finger: `(pointer: coarse)` true → G1–G5 at iPad size
(fill canvas, 4-col 104 px buttons — likely OK width-wise; HUD 40 px vs
`34 * width/360` overlap is worse because `ui` is large). iPad with trackpad /
mouse: primary `pointer` is often `fine` while `any-pointer: coarse` and
`maxTouchPoints > 0`. `useCoarsePointer` only reads `(pointer: coarse)`
(`useCoarsePointer.ts:10`), so that iPad gets the **desktop** 9:16 column and
**no** `TouchControls`. Audio routing *does* also key on `maxTouchPoints`
(`audioOutput.ts:46–49`) — layout and audio disagree. Split View / Stage
Manager: `visualViewport` resize is handled; no tests.

**Why it blocks:** Spec puts iPad `(pointer: coarse)` on the **same ACs** as
iPhone, so the 40 px HUD constant vs scaled canvas HUD is a real overlap on
iPad fill — not polish. `pointer: fine` + keyboard iPad is the Desktop board
(acceptable). Split View / Stage Manager were not specified.

**Design-level fix:** Keep play-surface detection as `(pointer: coarse)` (spec /
PR #49 — not UA). Cap or measure the HUD bar from the canvas `ui` scale so
iPad fill does not overlap the strip. Treat `pointer: fine` + `maxTouchPoints > 0`
as a known miss (keyboard iPad plays desktop 9:16 — acceptable if that board
is Desktop). Split View: best-effort via existing `visualViewport` listener.

---

## Not blocking (nice-to-have / out of scope)

| Item | Why not blocking for web launch |
| --- | --- |
| Haptics (`navigator.vibrate` is a no-op on iOS; Taptic Engine needs a native wrapper) | Playable without it. |
| Game Center | Identity is Firebase + free leaderboard. |
| APNs / push | No live-ops requirement in this client. |
| Offline / service worker | Sim is client-side after JS loads; save/share need network. Show a clear offline error; do not queue silent score posts. |
| Capacitor / WKWebView shell / App Store binary | Explicitly out of scope. A binary does not remove G1–G10; it adds review, IAP, and a second tree. |
| Dynamic Type beyond `-webkit-text-size-adjust: 100%` | Layout-stable; overlay copy is not the climb. |
| 3× backing store (DPR clamped to 2) | Intentional; not a launch bug. |
| Guest anonymous save | Product, not iOS. |

---

## Device matrix

| Surface | Role |
| --- | --- |
| **iPhone Safari, portrait** | **Launch-critical.** Must complete climb + share + sign-in. |
| iPhone Safari, landscape | **Required not to break** (rotate overlay or letterbox — not Orientation Lock API). |
| iPhone Home Screen standalone | **Launch-critical** for the chosen vehicle (spec: Safari + Home Screen). G6 is in the v1 set, not a phase-2 bonus. |
| iOS 16.4+ Safari | **Minimum** for Wake Lock + current visualViewport behaviour. |
| iOS 16.0–16.3 | **Best-effort:** no Wake Lock; keep the “leave screen on” copy. |
| iOS 26 Safari (current) | **Launch-critical to verify on device** — not emulatable here. New Safari chrome / `dvh` quirks are a must-check, not a separate product. |
| iPad Safari, `(pointer: coarse)`, full screen | **Same ACs as iPhone** (spec). HUD-scale overlap (G5/G12) must be fixed on this surface too. |
| iPad split-screen / Stage Manager | **Best-effort** (`visualViewport` already resizes). |
| iPad `(pointer: fine)` + keyboard | **Desktop board** (9:16, no touch bar). Out of the phone product. |
| Android Chrome, `(pointer: coarse)` | **Must not regress** (spec). Pixel 5 Playwright is the only automated touch coverage today. Do not block iPhone launch on Android-only polish. |
| App Store / TestFlight / Capacitor | **Out of scope.** |

Playwright Chromium + UA spoof is **not** a row on this matrix.

---

## Recommendation

### Can a player complete a climb + share + sign-in on iPhone Safari *today*?

**Climb — mostly, in portrait, after hydration, if they do not pinch, rubber-band, rotate, or let the phone sleep.** The sim, fill canvas, hold controls, safe area, ringer-safe audio graph, and Start-tap unlock are real and in tree. The page around the game is not a game shell (G1–G4). Landscape is not a game (G5).

**Share — degraded.** “Share on X” can work. Copy link is unreliable on iOS Safari and there is no share sheet (G8). Do not call share done.

**Sign-in — likely, not proven on WebKit.** Redirect + same-origin `/__/auth` is the correct iOS design (G11). Pending-climb stash should survive a same-tab Google return; there is no automated proof and no localStorage backup. Guest on that screen does not save.

**Verdict: not launch-ready as an iPhone client.** Playable enough for an internal TestFlight-of-the-web (send `/play` to phones), not enough to announce “The Climb on iOS.”

### Smallest client change set for “mobile alone” without an App Store binary

Do **not** start a native app. Fix the existing `/play` coarse-pointer tree:

1. **Play shell = non-scrolling viewport** (G1, G2): `100dvh` + `overflow-hidden` + `overscroll-behavior: none`; drop Navbar/tabs/how-to from layout while the stage is up.
2. **First paint is already fill** (G3): CSS or pre-React `pointer: coarse` class; stop `useState(false)` as the layout source of truth.
3. **Stage `touch-action` + no nested document scroll** (G4).
4. **Portrait contract** (G5): landscape rotate **overlay** (not Orientation Lock) or letterboxed `fitCanvas`; HUD offset from scaled bar + side safe-area. iPad fill uses the same HUD-scale fix.
5. **Wake Lock on Start** (G7).
6. **`navigator.share` + 44 px share/sign-in** (G8).
7. **Home Screen PWA chrome** (G6): manifest, PNG apple-touch-icon, `appleWebApp`.
8. **Audio start in the Start stack; no mount-time `ensureContext`** (G10).
9. **Pending-climb + redirect in localStorage TTL** (G11).
10. **WebKit Playwright smoke + `fillCanvas` unit tests; one human iPhone Safari pass** (G9).

That set is still the **web** client. It is the installable iOS client. An App
Store binary is a later distribution choice, not a prerequisite for mobile-alone.
