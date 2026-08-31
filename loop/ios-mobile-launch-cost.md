# iOS / mobile-alone launch — unit economics

**Date:** 2026-08-31  
**Role:** cost (investigation only; no infra change)  
**Product:** The Climb on `https://www.doomstack.lol` (Next.js on Vercel; Prisma/Neon; Upstash Redis; Firebase Auth; Stripe Checkout).  
**Spec envelope:** `loop/spec.md` is absent. There is no prior cost NFR. This note is the envelope for the iOS/mobile-alone investigation.

**Verdict:** The cheapest vehicle that still achieves “the game launches on iPhone without a desktop” is **stay on Vercel web + iOS Safari / Add to Home Screen**. Incremental spend versus today is static CDN bytes (required touch icons + manifest) plus whatever extra signed-in climb POSTs mobile actually produces. An App Store binary and a native rewrite are not required to meet that bar, and both add take-rate, dual payment rails, and duplicated subsystems before they add a single extra metre of climb.

Do not change hosting, payment processor, or auth provider to “save money” for this launch.

---

## 1. Service cost models (what the bill actually meters)

Prices are public list rates as of 2026-08-31. Use them as **drivers**, not as a monthly forecast. Region for Vercel Fluid below is `iad1` (Washington D.C.), the default US region.

| Service | How it bills | Metric that spikes the bill | Included / start tier this stack already uses |
|---|---|---|---|
| **Vercel** (hosting) | Edge Requests + Fast Data Transfer + Fluid Active CPU + Provisioned Memory + Function Invocations + ISR reads/writes | Uncached dynamic HTML, `/api/*` origin hits, Edge OG rasterization, ISR writes on every saved climb | Hobby: 1M Edge Requests, 100 GB transfer, 1M invocations, 4 CPU-hours, 360 GB-hrs memory, 1M ISR reads, 200k ISR writes. Pro: $20/seat + 10M Edge Requests then **$2 / 1M**, 1 TB then **$0.15/GB**, invocations **$0.60 / 1M**, Active CPU **$0.128/h**, memory **$0.0106 / GB-hr**, ISR writes **$4 / 1M** |
| **Neon Postgres** | CU-hours awake + GB-month storage + egress | Always-on compute (scale-to-zero off) and **unbounded `climb_runs` inserts** (replay tokens up to 32 KiB) | Free: 100 CU-hours + 0.5 GB. Launch: **$0.106 / CU-hour**, **$0.35 / GB-month**, 500 GB egress then $0.10/GB |
| **Upstash Redis** | Commands (REST = 1 command each) | Rate-limit `INCR`+`EXPIRE` on every climb/checkout/auth attempt; view-pipeline `INCR`/`SET NX` on paid-stack page views | Free: 500k commands + 256 MB. PAYG: **$0.20 / 100k commands** |
| **Firebase Auth** | MAU (email / Google / Apple / anonymous = Tier 1) | Distinct humans who **sign in** that month — not redirect count | **50k MAU free**, then $0.0055 → $0.0025 / MAU. SMS is a different meter; this app does not use phone auth |
| **Stripe Checkout** | Per successful charge | Paid listings / top-ups (`MIN_ENTRY_USD` $5, `MIN_SPEND_USD` $2) | US cards **2.9% + $0.30**. No monthly fee. International +1.5% |
| **Google Fonts** | None at runtime | — | `next/font/google` self-hosts at build (`layout.tsx`) |
| **Apple** (not used today) | Annual membership + IAP commission | Digital goods sold **in** a binary | Developer Program **$99 / year**. IAP **15%** (Small Business, proceeds ≤ $1M) or **30%** standard |

`app/vercel.json` does not set regions, `maxDuration`, or memory. Functions inherit platform defaults (Hobby maxDuration 10 s; Pro 15 s unless raised). `/api/og` is `runtime = "edge"`; every other API route is `runtime = "nodejs"`.

---

## 2. Unit costs for what the code already does

### 2.1 One signed-in climb finish (today)

Client (`ClimbScene`): encodes the input log **in the browser**, then `POST /api/climb/result` with Bearer token and optional `replayToken` (cap `MAX_REPLAY_TOKEN_LENGTH = 32_768`). Anonymous finishes **do not POST** — they stash JSON in `sessionStorage` and wait for sign-in.

Server (`app/app/api/climb/result/route.ts`):

1. JSON parse + `checkClimbResult` (closed-form bound, not a replay).
2. Rate limit: Redis `INCR` + maybe `EXPIRE`, namespace `climb`, **60 / 60 s / IP**, **`failMode: "open"`**.
3. `verifyIdToken` (Firebase Admin → Google).
4. `ensureUser` upsert.
5. `climb_runs` **INSERT** (always; includes `replay_token`).
6. `climb_records` upsert (monotonic `peak_y`).
7. Two `COUNT`s for rank + `users.display_name`.
8. `revalidatePath("/climb")` and `revalidatePath("/")` — two ISR writes. `/climb` is also `dynamic = "force-dynamic"`, so the revalidate of `/climb` does not buy a cache hit; `/` does (`revalidate = 60`).

| Meter | Units per signed-in finish | List $ |
|---|---|---|
| Function invocation | 1 | $0.60 / 1M → **$0.0000006** |
| Redis commands | 2 (happy path) | $0.20 / 100k → **$0.000004** |
| Neon writes | 2–3 + 2 counts | CU-seconds while compute is awake, not per query |
| ISR writes | 2 (1 useful: `/`) | $4 / 1M → **$0.000008** |
| Postgres row | 1 `climb_runs` row, `replay_token` ≤ 32 KiB | Storage **$0.35 / GB-month** → **≲ $0.000011 / row / month** if every run stores the full 32 KiB |

**Encode/decode is not on the function today.** `encodeRunReplay` / `decodeRunReplay` run in the client (`ClimbScene`, `ClimbPlayClient`). `/play?r=` is a client `useEffect` inflate, not a Node duration line. See §5.4 for the spike if ranked AC-17 re-simulation is later moved onto the route.

### 2.2 One anonymous climb finish (today)

**$0 origin** for `/api/climb/result`. CPU is the phone. If a later change POSTs every anonymous finish “for analytics,” you inherit the invocation + Redis pair **and** the fail-open hole in §5.1, still without a DB write (no token → `{ saved: false }`).

### 2.3 One Google sign-in (iOS Safari redirect)

`signInWithRedirect` (`app/app/auth/signin/page.tsx`). Not a popup.

| Step | Who pays | Driver |
|---|---|---|
| Navigate to Google → bounce to `/auth/signin` | Vercel Edge Request + HTML/JS transfer, twice (leave + return) | Page weight, not Firebase |
| Identity Toolkit token | Firebase **MAU**, not per redirect | 1 MAU / human / month in the 50k free bucket |
| `getRedirectResult` + `onIdTokenChanged` → `POST /api/auth/sync` | 1 Node invocation + Redis (20 / 60 s / UID, **fail closed**) + 1 user upsert | Retries from ITP / `auth/unauthorized-domain` multiply invocations, not MAU |
| Hourly token refresh while the tab/PWA stays open | Another `/api/auth/sync` per hour (`AuthContext`) | Long Home Screen sessions: up to ~24 syncs / MAU / day if the web app is left open |

Firebase does not bill per Google redirect. The Safari cost is **extra document loads + `/api/auth/sync`**. iOS Intelligent Tracking Prevention and Home Screen standalone (no Safari cookie jar sharing in older iOS) cause **repeat redirects**, which is a Vercel invocation spike, not a Firebase MAU spike.

### 2.4 One OG image miss

`GET /api/og` (`runtime = "edge"`, `@vercel/og` `ImageResponse` 1200×630). Cache-Control `s-maxage=60, stale-while-revalidate=300`. Cache key includes `v` (top block id), `name`, `alt`, `rank` — it churns when #1 changes, not per replay.

A PNG in this size is typically ~50–200 KB of Fast Data Transfer **plus** Edge CPU to rasterize on a miss. Layout `generateMetadata` fetches `/api/tower` with `revalidate: 60` to build that URL. `/api/tower` itself is `s-maxage=3` and calls `getRankedBlocks()` **with no `take`** (every visible row).

Share links today are `/play?r=<token>` and inherit the **site-wide** OG card, not a per-run image. Crawlers still fetch the play document (dynamic because of `searchParams`).

### 2.5 One $5 new listing vs one $2 top-up (Stripe, already live)

| Ticket | Stripe (2.9% + $0.30) | Effective % | Net |
|---|---|---|---|
| $5 `MIN_ENTRY_USD` | $0.445 | 8.9% | $4.555 |
| $2 `MIN_SPEND_USD` | $0.358 | 17.9% | $1.642 |
| $20 top-up | $0.88 | 4.4% | $19.12 |

Checkout is rate-limited 30 / 60 s (UID or IP), **fail open**, so a Redis outage never blocks a sale (do not “fix” that for cost).

Paid-stack views (not the climb) hit Edge middleware → `POST /api/internal/credit-view` (extra Node invocation + several Redis commands + possible `views_k` UPDATE). `/play` is **not** in the middleware matcher. A climb-only mobile launch does not credit seasons and does not run that pipeline.

---

## 3. Vehicle 1 — Stay on Vercel web, iOS Safari / Home Screen

**What already exists:** full-bleed canvas (`viewportFit: "cover"`), touch controls, iOS audio routing (`audioOutput.ts` / media-element sink), `/play` with no login wall. Playwright has a 375×812 **Chromium** project named `iphone-12` (UA spoof, no `hasTouch` / `isMobile`) — that is **not** iOS coverage (see G9 / NFR-8).

**What is missing for a Home Screen icon:** no 180×180 PNG `apple-touch-icon` (only `app/app/icon.svg` 32×32), no web app manifest. The **manifest is required** for this launch (static CDN bytes, not a function meter). No service worker — keep SW **out of v1**.

### Incremental cost versus today

| Item | Unit | If mobile is the growth channel |
|---|---|---|
| 180×180 / 192 / 512 PNG icons | One download per install, then cache | ≲ 50 KB Fast Data Transfer / first Home Screen add. Hobby includes 100 GB |
| Required `manifest.webmanifest` | Same | Bytes, not functions. Required by AC-9 (`scope: "/"`, `start_url: "/play"`). |
| Service worker | Out of v1 | Can cut origin hits if it caches `/play` shell; can add a request on every navigation if mis-scoped. Do not add a chatty SW “for PWA” this cycle |
| Extra `/play` document loads | 1 Edge Request + JS/CSS/canvas tile transfer per visit | Game loop is client-side; origin is idle during play |
| Extra signed-in finishes | §2.1 | Only if Home Screen users **sign in to save**. Anonymous play is free at origin |
| Extra Google redirects | §2.3 | If the growth loop is “play → sign in with Google to keep the height” |

No Apple fee. No IAP. Stripe stays on the web for paid stacks. Firebase stays inside the 50k MAU free bucket until 50,001 distinct sign-ins in a month.

### Caps (recommend; do not implement in this investigation)

- Keep **anonymous play origin-silent** (current client). Do not start POSTing unsaved runs without a separate cost review.
- If signed-in mobile play grows: cap `climb_runs` retention or store `replay_token` only on personal-best / share, not every death. Storage is the slow leak, not CPU.
- Do not add per-replay OG images as part of “make it feel native.”
- A service worker, if added later, must cache the play shell and must not revalidate APIs every tick.

**Engineering cost:** required icons + `apple-mobile-web-app-capable` / manifest (AC-9). No second renderer, no second store, no second payment rail.

---

## 4. Vehicle 2 — Apple Developer Program + TestFlight + App Store (wrap or thin native)

Fixed and take-rate costs, independent of traffic:

| Line | Unit $ | Notes |
|---|---|---|
| Apple Developer Program | **$99 / year** | Required for TestFlight and store. Not per app |
| IAP commission | **15% or 30%** of digital goods | Altitude / rank / paid stacks are digital goods. Guideline 3.1.1: if the binary **initiates** the purchase, it must be IAP. Stripe Checkout inside a WKWebView is a rejection risk, not a savings |
| Sign in with Apple | $0 Apple fee; 1 extra Firebase provider (still Tier 1 MAU) | Guideline 4.8: offering Google in a native app **requires** an equivalent SIWA control |
| Review delay / rejection cycles | $0 cash, lost listings | 4.2 Minimum Functionality rejects “just a website” wrappers unless there is native value |
| Screenshot / preview set | Time + optional device farm | Required 6.7″ (and historically 5.5″) shots. TestFlight is included in the $99. Paid farms (BrowserStack App Live, AWS Device Farm) are **$/device-minute** only if you cannot use a physical iPhone + Simulator |
| Duplicate IAP backend | Ongoing function + storage | App Store Server Notifications v2 **plus** the existing Stripe `checkout.session.completed` webhook. Two idempotency keys, two credit paths into `payments` / altitude. Do not delete the Stripe path — web buyers remain |

### Take-rate versus current Stripe (same ticket)

| Ticket | Stripe fee | IAP 15% | IAP 30% | Extra vs Stripe @ 15% | Extra vs Stripe @ 30% |
|---|---|---|---|---|---|
| $5 listing | $0.445 | $0.75 | $1.50 | **+$0.305** | **+$1.055** |
| $2 top-up | $0.358 | $0.30 | $0.60 | **−$0.058** (IAP slightly cheaper; Stripe’s $0.30 flat dominates) | **+$0.242** |
| $20 top-up | $0.88 | $3.00 | $6.00 | **+$2.12** | **+$5.12** |

Primary product price is **$5 minimum entry**. IAP is strictly more expensive than Stripe at that ticket even on Small Business 15%. IAP only “wins” on sub-~$3 tickets at 15%, which is not the listing SKU.

A **game-only** App Store binary still cannot open Safari for paid stacks as a 3.1.1 workaround: Guideline **3.1.3(f)** forbids calls to action for purchase outside the app. Game-only means **no in-app purchase and no outbound buy CTAs** (architecture §5.1). You still pay $99/year, SIWA if Google stays, review, and wrapper work for zero incremental altitude revenue.

Capacitor / WKWebView wrap of the existing Next app still hits origin for every API. It does **not** remove Vercel/Neon/Upstash/Firebase; it **adds** Apple’s layer on top.

---

## 5. Bill spikes (call these out in monitoring, do not delete the controls)

### 5.1 Climb POST fail-open 60/min/IP

```34:37:app/app/api/climb/result/route.ts
// Climb runs finish frequently, so keep the cap high. Keyed by client IP since
// most play is anonymous. Fails OPEN so a Redis outage never blocks play.
const CLIMB_RATE_MAX = 60;
const CLIMB_RATE_WINDOW_SECONDS = 60;
```

- **Intended:** 60 POSTs / minute / client IP when Redis is healthy.
- **Fail-open:** Redis error → `allowed: true` for every request (`rateLimit.ts`). The cap disappears. Do **not** switch this to fail-closed to save money — that would block the free game when Upstash blips (reliability control).
- **Authenticated abuse:** each request still writes `climb_runs` (unbounded history) and two ISR writes.
- **Bot math (invocations only):** 60/min × 1,440 min = **86,400 POST/IP/day**. 12 IPs at cap ≈ 1M invocations/day ≈ **$0.60/day** on Pro invocation overage, **before** CPU, Neon, and ISR. 1,000 IPs ≈ **$50/day** invocations. Fail-open removes even that 86,400/IP ceiling.
- **CGNAT:** many iPhone users share one carrier IP, so the 60/min bucket is **tighter** for honest mobile players (UX) and **weaker** as a cost cap across a botnet with many IPs.

Recommend (later, with architect): keep fail-open; add a **Vercel WAF / firewall rate limit** in front so Redis outage does not equal infinite origin. That is a platform cap, not a deleted app control. Hobby includes 1M firewall-limited requests.

If the client stays anonymous-silent, this spike is latent until someone POSTs without a token or bots hit the route directly (it is public).

### 5.2 OG image generation if share links explode

Today: one cache key per top-block snapshot, 60 s TTL. Viral **site** shares are bounded (~1 raster / minute / unique #1).

Spike if product adds **per-replay OG** (`/api/og?r=<token>` or similar):

- Every unique token is a cache miss.
- Each miss: Edge CPU for Satori + ~50–200 KB PNG egress.
- Tokens up to 32 KiB also bloat the request URL / Referer on `/play?r=`.

`/play?r=` already makes the play **page** dynamic. A crawler storm of unique replay URLs: Edge Requests + JS transfer + layout’s `/api/tower` (cached 60 s on the fetch, 3 s on the route). The expensive part is **not** decode (client); it is **uncached documents + optional per-token images**.

Cap: do not key OG on the replay token. Keep the one site card. If a richer card is required, hash seed+peakY into a coarse key (metres bucket), not the raw log.

### 5.3 Firebase Auth Google redirects

Spike shape: sign-in retries on iOS (ITP, Home Screen cookie isolation, `auth/unauthorized-domain`), not MAU.

- Each failed redirect still costs 2 document loads.
- `onIdTokenChanged` fires `/api/auth/sync` on every successful session restore (fail-closed 20/min/UID — a Redis outage **denies** sync; climb save self-heals via `ensureUser` on POST).
- 50,001st MAU in a month: **$0.0055** each thereafter ($275 to go from 50k to 100k). Mobile-as-growth-channel can be the thing that crosses 50k; the redirect itself is not the meter.

Cap: do not add phone/SMS auth. Do not enable SAML/OIDC (Tier 2, $0.015/MAU after 50). SIWA, if required later for a binary, stays Tier 1.

### 5.4 Vercel function duration for encode/decode / replay

**Today:** inflate/deflate is browser `CompressionStream`. Function duration on POST is token verify + a few queries. Default 10–15 s is ample.

**If AC-17 ranked verification is implemented as “re-sim seed + input log on the server”:**

- `MAX_SHARE_TICKS = 18_000` (10 min at `TICK_HZ = 30`). `MAX_RUN_TICKS` for the bound is **6 hours** (648,000 ticks) — do not re-sim that on a request path.
- Geometry is prefix-sum + LRU seed cache (`createSeedCache`) — the old O(floor²) 480 ms / 1600 floors scan is fixed, but 18,000 `stepMatch` ticks still burn Active CPU and hold Provisioned Memory for the whole instance lifetime (I/O wait still bills memory).
- LRU protects unbounded Map growth; keep it. Do not “optimize” by deleting the cache.
- A 10 s Hobby timeout on a long re-sim bills the duration **and** returns 5xx; clients retry → doubled CPU.

Cap: if server re-sim ships, re-sim only `MAX_SHARE_TICKS`, set an explicit `maxDuration` with a budget (e.g. 3 s), and reject longer logs. Prefer verifying at share-time on the client and storing a hash, not replaying 6-hour runs on Fluid.

### 5.5 Other origin amplifiers (not iOS-specific, worse if mobile browses paid stacks)

- `getRankedBlocks()` with **no `take`** on `GET /api/tower` (also used for OG). Payload and query time grow with every listing.
- `TowerView` polls every **10 s** (`PUBLIC_CONFIG.pollIntervalMs`). Climb play does not.
- `console.log` JSON on every successful `/api/auth/sync` — log volume tracks sign-in, not play.

---

## 6. Vehicle 3 — Native rewrite (Unity or Swift)

Do not quote calendar. Quote **subsystems that must be duplicated**. A rewrite does not turn off Vercel until the web app is deleted; until then you pay **both**.

| Subsystem | Web today | Must exist again in the binary | Second store (Play) |
|---|---|---|---|
| Renderer | Canvas 2D, `ClimbCanvas`, volcano tile decode, `devicePixelRatio` clamp, full-bleed iOS stage | New GPU/UIView or Unity camera + sprite pipeline + notch safe-area | Yes |
| Simulation | Fixed 30 Hz `stepMatch`, towers/hazards/powerups, prefix-sum geometry, antiCheat bounds | Port or bind the same rules; bit-identical replay (AC-11) is the contract | Same binary or a second engine |
| Input | Touch hold + keys; iOS 300 ms click guard | UIKit/Unity input; no DOM | Yes |
| Audio | Web Audio + hidden media element so iOS uses the media channel, not the ringer | AVAudioSession / Unity mixer; Silent switch behaviour | Yes |
| Replay | Client deflate + `/play?r=` | Encode/decode without `CompressionStream`; share via `UIActivityViewController` | Yes |
| Auth | Firebase email + Google redirect; cookie for middleware | Native SDK + **Sign in with Apple**; optional Game Center | Google/Play Games |
| Persistence | `POST /api/climb/result`, Neon | Same API or a new backend | Same |
| Payments | Stripe Checkout + webhook | **IAP** (StoreKit 2) + App Store Server Notifications; Stripe remains for web | Play Billing |
| Leaderboard UI | `/climb` RSC, `topFreeClimbers(take: 50)` | Native list or WKWebView of the same page | Yes |
| Store presence | — | App Store Connect, screenshots, review, encryption export answers | Play Console ($25 one-time) |

Unity: one project can target iOS + Android, but you still duplicate **store, IAP, SIWA/Play Games, and review**. Swift-only: iOS renderer+sim only; Android is a third copy or a leftover web.

This is the most expensive vehicle in **engineering duplication** and in **ongoing dual-stack ops**. It is not cheaper hosting: native clients still call the same Node routes unless you also rewrite the backend.

---

## 7. Recommendation

**Ship vehicle 1.** The climb already runs on iPhone Safari. Home Screen is an icon + manifest, not a new product. Unit cost of a mobile session that does not sign in is **CDN bytes**. Unit cost of a mobile session that signs in and saves is §2.1 (sub-cent even at list overage). That meets “launches on iPhone without desktop.”

Stay on the **included tiers this host already uses** (Vercel Hobby or existing Pro seat, Neon Launch/Free, Upstash free/PAYG, Firebase <50k MAU, Stripe). Do not add Apple, IAP, or a second renderer to reduce spend — they only add meters.

### What would make App Store cost-justified later

Pay $99/year + IAP 15–30% + dual payment rails **only when** at least one of these has a measured unit value greater than the extra take and the duplicated subsystems:

1. **Push (APNs)** — burial / “you were overtaken” / season rollover that email cannot replace, and that changes conversion or retention enough to cover 15% of altitude GMV plus wrapper cost.
2. **Game Center** — a leaderboard or challenge graph that the web `/climb` board does not provide, with evidence that Game Center users pay or retain more than Safari users by more than the IAP haircut.
3. **Paid IAP as the actual checkout** — impulse $2–$5 inside the binary, where the **conversion lift** versus Safari Stripe Checkout exceeds the extra $0.305 per $5 (15%) or $1.055 per $5 (30%). At today’s $5 floor, IAP is a worse processor than Stripe unless it sells **more tickets**.
4. **App Store discovery** — organic installs whose CAC is below web CAC **after** Apple’s cut. If paid UA is the channel, buying iOS traffic into Safari/Home Screen is still cheaper than buying it into a 15–30% store.

Until one of those is true, an App Store listing is a **$99/year brand expense** plus review risk, not a cheaper way to run The Climb on iPhone.

---

## 8. Caps to carry into spec / architect (no infra change in this pass)

| Cap | Why |
|---|---|
| Do not POST anonymous climb results | Keeps fail-open 60/min/IP from becoming a write amplification until a WAF cap exists |
| Do not add per-replay OG | Unbounded Edge CPU + PNG egress |
| Do not server-re-sim runs longer than `MAX_SHARE_TICKS` on the request path | Fluid CPU + default maxDuration |
| Do not put Stripe Checkout inside a future binary | Forces IAP duplication |
| Do not fail-closed the climb limiter to save Redis | Blocks play on an Upstash blip |
| Give `getRankedBlocks` a `take` when architect next touches `/api/tower` | Unbounded `findMany` on the OG/metadata path |
| Retain `climb_runs` or null out `replay_token` except on share/PB | Neon GB-month leak under signed-in mobile grind |

---

## 9. Sources in this repo

- Stack: `context/profile.json`, `docs/deploy.md`, `app/vercel.json`
- Climb POST / fail-open: `app/app/api/climb/result/route.ts`, `app/src/lib/rateLimit.ts`
- Client POST/encode: `app/src/components/Game/ClimbScene.tsx`, `app/src/game/runReplay.ts`
- OG: `app/app/api/og/route.tsx`, `app/app/layout.tsx`
- Google redirect: `app/app/auth/signin/page.tsx`, `app/src/contexts/AuthContext.tsx`
- Stripe tickets: `app/src/engine/constants.ts`, `app/app/api/checkout/route.ts`
- iOS client already: `app/app/layout.tsx` `viewportFit`, `app/src/components/Game/audioOutput.ts`, `app/src/hooks/useCanvasSize.ts`
