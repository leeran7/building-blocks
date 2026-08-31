# iOS / mobile launch — compliance checklist

**Engineering checklist, not legal advice.** Investigation only; no production code.

**In-scope policies (do not invent others):** Apple App Store Review Guidelines 3.1.1 (IAP), 3.1.3(b) multiplatform, 4.2 Minimum Functionality, 4.8 Login Services, 2.3 metadata, 5.1.1 privacy / data collection, kids/age rating if relevant; plus what still applies to iOS Home Screen web apps / Safari (not App Store).

**Product facts this checklist is grounded in:** The Climb (endless climber) plus paid-stack leaderboards, hosted at `https://www.doomstack.lol` (`app/src/config/public.ts`). Firebase Auth (email, Google, anonymous). Stripe Checkout for paid altitude. Client-submitted climb scores. No privacy-policy page under `app/`.

**Guideline text** is from [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) as fetched 2026-08-31.

---

## 0. Personal-data inventory (lifecycle)

Collected / stored / processed / shared / deleted as the code actually does it. GDPR/SOC2 are **not** in-scope regulations; this table exists so the Apple sections below have a real inventory.

| Data | Collected | Stored | Processed | Shared | Deleted |
| --- | --- | --- | --- | --- | --- |
| **Firebase UID** | Sign-in (email, Google, anonymous) via Firebase JS SDK | Postgres `users.id` for email/Google (`app/prisma/schema.prisma:26–38`); anonymous UID stays in Firebase IndexedDB only — no `users` row (`app/app/api/climb/result/route.ts:136–139`, `app/src/contexts/AuthContext.tsx:59–60`) | Authz on API routes; climb save; block ownership | Google (Identity Toolkit / `*.googleapis.com`, CSP `connect-src` in `app/next.config.js:29`); public leaderboard HTML uses UID as React `key` (`app/src/components/Climb/ClimbLeaderboard.tsx:59`) | **No deletion path.** No `deleteUser`, no account-delete UI on `/settings` |
| **Email** | Email/password signup; Google OAuth token claim; new-listing checkout `owner_email` (`app/app/api/checkout/route.ts:60, 232`) | `users.email` UNIQUE NOT NULL; `blocks.owner_email` | `ensureUser` upsert (`app/src/db/user.ts:24–35`); dashboard `{ user: { id, email } }` (`app/app/api/dashboard/route.ts:22`) | Firebase/Google; Stripe Checkout (hosted payment page). **Not** in public tower JSON (`app/app/api/tower/route.ts:60–77` omits `owner_email`). Leaderboard shows handle, never email (`app/src/lib/handle.ts:1–8, 45–48`) | None. User-row `onDelete: Cascade` would drop climb records / saved URLs **if** a delete existed; `ClimbRun.userId` and `Block.userId` are `SetNull` — `owner_email` on blocks would remain |
| **Display name** | Optional `/settings` (`app/app/settings/page.tsx:125–141`) | `users.display_name` | Public climber label | Public leaderboard (chosen name, else pseudonym) | None |
| **Password** | Email signup/signin | Firebase Auth only (not in Postgres) | Firebase | Google LLC as auth processor | None in this repo |
| **Google account** | “Continue with Google” (`app/app/auth/signin/page.tsx:349–365`, `app/app/auth/signup/page.tsx:396–412`) | Same as UID+email | OAuth redirect; `authDomain` is first-party `www.doomstack.lol` via `/__/auth` rewrite (`app/next.config.js:59–67`) — built to avoid Safari third-party cookies | Google Sign-In (`accounts.google.com` in `frame-src`) | None. No revoke-credentials UI (App Store 5.1.1(v) would care) |
| **Anonymous session** | “Continue as guest” (`signInAnonymously`, `app/app/auth/signin/page.tsx:367–386`) | Firebase IndexedDB | Play without save | Firebase | Sign-out / clearing site data. Never provisioned in Postgres |
| **Climb scores / runs** | Client POST `peakY`, `ticks`, `seed`, optional `replayToken` (`app/app/api/climb/result/route.ts:39–47, 149–157`) | `climb_records` (monotonic peak) + `climb_runs` (history/replay) | Public free leaderboard; replay links | Public handles + heights. Replay URL is a shareable token | None. Trust: `peakY` is client-reported and `Math.max`-persisted (`context/trust.md` §1) — irreversible write |
| **Saved URLs** | Settings + checkout (`SavedUrl`) | Postgres | Prefill submit | Not public | Settings can remove from the list; no account wipe |
| **Paid blocks / altitude** | `/submit` + `/api/checkout`; Stripe webhook credits metres | `blocks`, `payments`, `payment_dead_letters` | Public towers; record pages “never deleted” (`app/app/b/[slug]/page.tsx:6–7`) | Public: `display_name`, `url`, altitude, spend. Stripe sees amount + session metadata (`block_id`, `season_id`, `category`) | No customer deletion job. Admin hide sets `hidden_at` (audit log to stdout, `app/app/api/admin/hide/route.ts:38–40`) |
| **Card / PAN** | Not collected by this app. Stripe Checkout is a **redirect** (`checkout_url`, `app/app/api/checkout/route.ts:254–288`). `@stripe/stripe-js` has **no production importer** | Stripe | Stripe | Stripe | Stripe’s retention, not this repo |
| **IP address** | `x-forwarded-for` / `x-real-ip` (`app/src/lib/rateLimit.ts:82–92`) | Redis: climb rate-limit 60s (`app/app/api/climb/result/route.ts:36–37, 99–104`); checkout 60s; view `ip_cap:{ip}:{hour}` TTL **70 minutes** (`app/src/views/ipCap.ts:4–12, 25–27`). Logs use `ip_hash` not raw IP (`app/src/lib/logger.ts:41–50`) | Rate limit; view qualification (paid stack pages only) | Vercel/edge → Redis. Not written to Postgres | TTL expiry only. No purge job |
| **`tid` cookie** | Middleware, **not** on `/play` or `/climb` (`app/middleware.ts:49–51, 85–95`) | httpOnly, Secure in prod, SameSite=Lax, **365 days** | Session dedup for paid-stack view counting (`dedup:` keys TTL 35 min) | First-party only | Cookie expiry / user clears site data |
| **`firebaseToken` cookie** | Client sets the **ID token JWT** (`app/src/lib/authCookie.ts:18–26`) | **Not httpOnly**, Max-Age 7 days, SameSite=Lax. JWT includes email + UID | Middleware presence-only for `/dashboard` (`app/middleware.ts:8–9, 59–68`) | Readable by any script on the origin (and by a WKWebView wrapper) | `clearTokenCookie` on sign-out |
| **UA** | View pipeline | Truncated 80 chars in logs | Bot filter | Stdout logs | Log retention at host |
| **Mute pref** | `localStorage` (`usePowerUpFeedback.ts`) | Device | Audio | None | User clears site data |
| **Pending climb** | `sessionStorage` (`ClimbScene.tsx`) | Tab | Retry save after sign-in | None | Tab close |

**Not found in `app/`:** privacy policy page or footer link (`app/src/components/LandingPage/Footer.tsx:125–138` is How it works + Rules only); cookie/consent banner; Sign in with Apple; account deletion API; retention cron; analytics pixels / `gtag` / ATT; `getUserMedia` / photo / file capture; `navigator.share`; Web App Manifest; `apple-mobile-web-app-capable`.

**Third parties that see user or usage data:** Google (Firebase Auth + Google Sign-In), Stripe (payments), Vercel (request logs / IP), Neon Postgres, Upstash Redis. CSP also allows `js.stripe.com` / `hooks.stripe.com` / `apis.google.com`.

**Privileged mutations (existing, not iOS-specific):** admin hide / refund / season-rollover log `admin_action` JSON to stdout. Not a user-deletion trail.

---

## 1. Vehicle A — mobile web only (Safari + Add to Home Screen)

App Store Review Guidelines **do not apply**. No binary, no App Store Connect privacy nutrition labels, no ATT prompt.

### Still applies (Safari / Home Screen web apps)

| Item | Status | Notes |
| --- | --- | --- |
| App Store 3.1.1 / IAP | N/A | Stripe on the website is a website payment |
| 4.2 thin wrapper | N/A | There is no binary |
| 4.8 Sign in with Apple | **Not required** | 4.8 is an App Store rule. Google Sign-In on the web is fine without SIWA |
| App Tracking Transparency | **N/A** | ATT is an App Store / native API. No IDFA, no advertising SDK found |
| Privacy nutrition labels | **N/A** | App Store Connect only |
| Age rating questionnaire | **N/A** | Store listing only. Content is still lava/elimination (see §2) |
| Web App Manifest | **Optional, currently absent** | No `manifest.webmanifest`. Add to Home Screen will use Safari’s default (screenshot-style icon unless `app/app/icon.svg` is picked up as `rel=icon`) |
| `apple-mobile-web-app-capable` | **Absent** | Home Screen shortcut likely opens **in Safari chrome**, not standalone. That is a product/mobile finding, not an Apple privacy obligation |
| `viewport-fit: cover` / `themeColor` | Present | `app/app/layout.tsx:44–47` — notch-safe; not a privacy control |
| Permissions-Policy | Present | `camera=(), microphone=(), geolocation=()` (`app/next.config.js:20`) — no sensor PII |
| Safari ITP / third-party cookies | Mitigated for auth | `/__/auth` proxied first-party (`app/next.config.js:59–67`) |
| iOS 16.4+ Home Screen push | Unused | If added later: Safari notification permission, still not ATT |
| Cookie / consent banner | **None found** | Apple does not require a CMP for Safari websites. Inventory only: `tid` is 365-day httpOnly first-party and is **not** set on `/play` or `/climb`. `firebaseToken` is a 7-day JS-readable JWT after sign-in |

### Checklist for a v1 game-on-the-web launch

1. **Privacy policy URL (do this even though Apple does not mandate it for websites).** There is no `/privacy` (or any “privacy” string) in `app/`. Footer legal row is copyright only (`Footer.tsx:142–154`). You still collect email, UID, scores, IPs, and share with Google + Stripe. Google Cloud / Firebase / OAuth consent screens and Stripe typically expect a policy URL. **5.1.1(i) will block any later App Store binary until this exists in-app and in App Store Connect.** Treat publishing a policy that matches §0 as the one web-side notice gap worth closing now.
2. **Cookie/consent.** No banner. For Apple/Safari: not required. `tid` is functional view-counting on paid stack/record routes only. Game-only visits to `/play` do not get `tid`.
3. **PII actually collected on the game path.** Anonymous play: no email, no `users` row; IP used 60s for `/api/climb/result` rate limit; score accepted but `{ saved: false }` without a token+email (`climb/result/route.ts:119–140`). Signed-in play: UID, email, peak, seed, optional replay token. Google Sign-In adds Google as a login processor. Stripe is **not** on `/play`; Navbar still links Browse / Get started / Dashboard into the paid product (`Navbar.tsx:73–110`).
4. **Deletion path.** **Does not exist.** `/settings` is display name + saved URLs (`settings/page.tsx:3–7, 125–152`). A comment or `onDelete: Cascade` in Prisma is not a deletion implementation. Redis keys expire; Postgres/Firebase/Stripe do not. For web, Apple does not require in-app account deletion. For a later store binary, 5.1.1(v) does.
5. **ATT.** N/A.
6. **Sign in with Apple.** **Not required** on Safari / Home Screen.

**Web-only residual risks (not Apple store rejection):** public Firebase UIDs in leaderboard markup; JWT in a non-httpOnly cookie; irreversible client-reported scores on a public board; no user-facing deletion.

---

## 2. Vehicle B — App Store binary wrapping the site (`doomstack.lol`)

Assume a WKWebView / Capacitor / “thin client” that loads the existing Next app (or `/` → full product). Findings use the live tree.

| Sev | Guideline | Location | Issue | What “fix” means (not implementing here) |
| --- | --- | --- | --- | --- |
| **critical** | **4.2** Minimum Functionality; **4.2.2** web clippings; **4.2.7(e)** “Thin clients for cloud-based apps are not appropriate for the App Store.” | Whole `app/` shipped via remote URL; `PUBLIC_CONFIG.siteUrl` `app/src/config/public.ts:13` | The product is already a website. A binary that primarily loads it does not “elevate it beyond a repackaged website.” 4.7 (HTML5 mini-games) is for software *inside* a native app that still meets 4.2, not a full-site wrapper. | Do not submit a wrapper. Bundle a native/WebView **game** with local assets, or stay on Safari. |
| **critical** | **4.2.3(ii)** disclose download size before additional resources on initial launch | Remote HTML/JS/canvas from Vercel on every launch | The binary cannot function without downloading the site. No size disclosure / prompt exists. | Bundle enough to launch offline, or stay off the store. |
| **critical** | **3.1.1** IAP: unlock features / in-game currencies / premium content must use IAP. **3.1.3(g)** last sentence: ads/boosts consumed **in the same app** must use IAP. Paid altitude is rank/visibility on the in-app tower — digital, not 3.1.3(e) physical goods. | `app/app/api/checkout/route.ts:254–288` Stripe session (`Stack — ${displayName}`, altitude metres); `app/app/submit/page.tsx`; `TopupForm.tsx`; CTAs: `Hero.tsx` “Buy altitude”, `AuthShell.tsx:45` “Buy altitude.”, `Footer.tsx:47–56`, `Navbar.tsx:108–110` “Get started”, `stack/[category]/page.tsx` submit href | Stripe Checkout reachable from the wrapped app sells digital altitude. **3.1.3(b)** does **not** allow this: multiplatform apps may *recognize* web purchases **provided those items are also available as IAP**. US 3.1.1(a) (external purchase links without entitlement on the US storefront) is **not** a global Stripe-in-webview pass. | Remove every purchase CTA from the iOS binary **or** implement StoreKit IAP for altitude and keep Stripe off iOS. |
| **critical** | **4.8** Login Services | `signin/page.tsx:26–31, 187, 349–365`; `signup/page.tsx:28, 396–412` — `GoogleAuthProvider`, no `AppleAuthProvider` anywhere in `app/` | Google Sign-In is a named 4.8 third-party login. Equivalent option must (1) collect only name+email, (2) **let the user keep email private**, (3) not collect app interactions for ads without consent. Email/password does not satisfy (2). Sign in with Apple is the usual equivalent. Exceptions (company-only login, enterprise, government ID, client-of-that-network) do **not** fit: Google is offered *alongside* email. | Add SIWA as an equivalent control, **or** remove Google Sign-In from the iOS binary. |
| **critical** | **5.1.1(i)** Privacy Policies | No `/privacy`; `layout.tsx:73–97` metadata has no policy URL; Footer has no Privacy link | “All apps must include a link to their privacy policy in the App Store Connect metadata field **and within the app**.” Policy must name data, uses, third parties (Firebase/Google, Stripe, Vercel, Redis, Postgres), and **retention/deletion**. | Ship a policy that matches §0; link in-app + App Store Connect. |
| **critical** | **5.1.1(v)** Account Sign-In — if the app supports account creation, it **must also offer account deletion within the app** | `settings/page.tsx` (no delete); no delete route under `app/app/api/` | Email + Google create a primary account (`/api/auth/sync` upserts `users`). Guest play exists (good for the “let people use it without a login” half of 5.1.1(v)) but does not replace deletion for created accounts. Also: “include a mechanism to revoke social network credentials … from within the app.” | In-app delete that actually removes Firebase Auth + `users` (and explains leftover `blocks.owner_email` / Stripe / logs). |
| **warning** | **2.3** Accurate Metadata; **2.3.7** name; **2.3.3** screenshots show the app | `layout.tsx:75–77` title/description “Doomstack — Altitude is permanent” / buy-altitude copy; play route title “Play the Free Climb — Stack” (`play/page.tsx:12–16`); wordmark DOOMSTACK | Store listing as “The Climb” while the binary is Doomstack marketing + paid stacks is a metadata mismatch. Screenshots of lava death must still be 4+-safe (**2.3.8**). | Align name, screenshots, and description with what the binary actually is. |
| **warning** | **2.3.6** age rating questions | Game copy: “rising lava catches you” (`play/page.tsx:15`); ShareRun “before the lava caught me” (`ShareRun.tsx:22`); DESIGN burial/ember (`DESIGN.md:3–8`); paid copy “buries the weak” (`Footer.tsx:70–71`) | Honest answers: Cartoon/Fantasy Violence **and** Horror/Fear Themes, infrequent/mild → typically **9+**. Do **not** tick Kids Category (**1.3**, **5.1.4**): Firebase + Google + email + Stripe are incompatible with Kids third-party rules. Unrestricted Web Access: user-submitted `blocks.url` on record pages (`RecordStats` links `url`) → can force **17+** if stacks stay in the binary. **2.3.8:** no “For Kids” in metadata. | Rate 9+ (or 12+ if art/copy is harsher); 17+ if the wrapper includes arbitrary outbound listing URLs. |
| **warning** | **5.1.1** / App Privacy nutrition labels; **5.1.2** Data Use and Sharing | Firebase, Stripe, cookies above | App Store Connect must declare at least: Email, User ID, Product Interaction, Purchase History (if stacks stay), Crash data if you add a reporter. Linked to identity for signed-in users. Third-party sharing: Google, Stripe. **Tracking:** no ads SDK / IDFA found → likely **not** tracking under ATT **if** you do not use data to advertise across other companies’ apps/sites. Confirm Firebase/Google Analytics are **not** added later. | Fill nutrition labels from §0; do not claim “we do not collect data.” ATT prompt only if you actually track. |
| **info** | Photo library / camera | `Permissions-Policy` camera=(); no `getUserMedia`, no `capture`, no file input for photos | No photo permission string needed. | Keep it that way. |
| **info** | Pasteboard | `navigator.clipboard.writeText` in `ShareRun.tsx:29–36` (replay URL) and `SharePost.tsx:39–42` (listing copy); `ClimbReplaysSection.tsx:25–26`. No clipboard **read** | Write-only copy. iOS paste banners apply to **read**. Nutrition: not tracking. Native wrapper should not add pasteboard **read**. Prefer share sheet (**5.1.1(iii)**) if you go native. | No App Store blocker as written. |
| **info** | `firebaseToken` JWT cookie | `authCookie.ts:21–25` | Storing the ID token (email inside) in a JS-visible cookie is extra PII surface in a wrapper; 5.1.1(iii) minimization. | Prefer memory / httpOnly session if you ever native-ize. |

**3.1.3(b) in one sentence:** wrapping the site and saying “they could have bought on the web” does not authorize Stripe inside the iOS app; it requires IAP *in the app* for the same digital items.

---

## 3. Vehicle C — game-only binary (no paid stacks, no Stripe CTA)

Scope: `/play` + `/climb` + optional email/anonymous save. No `/submit`, `/stack`, `/b` top-up, checkout, “Buy altitude,” or Navbar Browse-to-towers.

### Findings that go away

| Finding | Why it goes away |
| --- | --- |
| **3.1.1 / 3.1.3(g) Stripe altitude** | No digital purchase and no in-app CTA (**3.1.3(f)** free companion: allowed *if* there is **no** purchasing inside the app **and no calls to action for purchase outside**). Navbar “Get started” / Browse / AuthShell “Buy altitude.” must not ship. |
| **3.1.3(b) web-purchased stacks inside the app** | Paid altitude is not a feature of the game binary. |
| **17+ unrestricted web access from listing URLs** | No `blocks.url` surface. |
| **Purchase History** on nutrition labels | No IAP / Stripe. |
| **`tid` / view-counting IP** | Middleware matcher does not include `/play` or `/climb`. |

### Findings that remain

| Sev | Guideline | Remains because |
| --- | --- | --- |
| **critical** | **4.2 / 4.2.2 / 4.2.3 / 4.2.7(e)** | A WKWebView of `https://www.doomstack.lol/play` is still a remote thin client unless the game is **bundled** (or 4.7-hosted inside a real native shell with local UI). |
| **critical** | **4.8** | **Remains if Google Sign-In stays.** Goes away if the iOS binary is email-only and/or anonymous-only (company’s own account setup — 4.8 exception). |
| **critical** | **5.1.1(i)** privacy policy in-app + Connect | Any App Store binary that collects UID/email/scores. |
| **critical** | **5.1.1(v)** account deletion | **Remains if** the binary can create accounts to save peaks. **Goes away if** play is device-local / anonymous-only with no account creation. Guest already exists; `/api/climb/result` already allows unauthenticated play. |
| **warning** | **2.3** metadata | Name “The Climb” vs Doomstack chrome on `FreeStackShell` / `Navbar` wordmark. |
| **warning** | **2.3.6** age rating | Lava/elimination copy stays. Expect **9+**. Still not Kids Category (Firebase if accounts remain). |
| **warning** | Nutrition labels | Email, User ID, Product Interaction if you save scores. Tracking still likely N/A without ads. |
| **info** | Pasteboard | `ShareRun` copy-link remains. Photo still N/A. ATT still N/A if no tracking. |

---

## 4. Recommendation — least new obligation for a v1 **game** launch

**Ship Vehicle A: mobile Safari (and optional Add to Home Screen).**

It is the only vehicle that does **not** create App Store obligations. Concretely avoided: 4.2 wrapper rejection, 3.1.1 IAP rebuild, 4.8 Sign in with Apple, 5.1.1(v) in-app deletion, nutrition labels, ATT, age-rating questionnaire.

**Single web-side gap worth closing before calling v1 “honest”:** a privacy policy URL that matches §0 (email, UID, scores, IP/rate limit, `tid` on paid routes, Google, Stripe, Firebase, no deletion). Apple does not reject Safari sites for lacking one; Google/Firebase/Stripe consoles and any later store submission will.

**Do not wrap `doomstack.lol` for v1.** 4.2 + 3.1.1 + 4.8 + 5.1.1(i)(v) are independent criticals; fixing privacy copy does not save a thin client that sells altitude with Stripe and Google Sign-In.

**If an App Store listing is a later goal:** Vehicle C as a **bundled** (not remote-URL) game, **no Stripe / no buy CTAs**, **no Google** (email or guest only) **or** SIWA, privacy policy + in-app delete if accounts exist, 9+ rating, nutrition labels. That is a new product surface, not a wrapper of the current site.

| Vehicle | New Apple obligations vs today | v1 game fit |
| --- | --- | --- |
| A Safari + Home Screen | None from the in-scope App Store rules. Optional: policy page | **Best** |
| B wrap the site | 4.2, 3.1.1, 4.8, 5.1.1(i)(v), 2.3, labels, age | Unfit |
| C game-only remote WebView | 4.2/4.2.3 still critical; 4.8/5.1.1 unless accounts/Google stripped | Unfit until bundled |
| C game-only bundled native | 5.1.1 policy (+ delete if accounts), 2.3, 9+ labels; 4.8 iff Google kept | Later, not least-obligation v1 |
