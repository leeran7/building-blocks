# Changelog

All notable changes to Tower are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- **Tighter climb HUD** — on a level, the stars and progress bar now sit
  right under the Height and Lava Clearance readouts and line up with them,
  and active power-up chips sit closer below, so the HUD covers less of the
  tower. Floor labels no longer draw under the goal bar.

- **Gecko is the final unlock** — the Gecko is no longer free after the
  tutorial: it unlocks only by clearing a season's last level (level 300),
  whatever the star count, and sits last in Choose Character. A player who
  already has it equipped keeps it until they switch away. The level result
  names it on that first level 300 clear.

### Added

- **Wraith colours** — the Void Walker now costs 600 gems (was 1,200), and
  two more Wraith colours join it in the Shop at 600 each: Blood Walker (red)
  and Frost Walker (ice blue). Each needs the Wraith first. Their tiles in
  Skin Details carry a colour dot, since they share the Wraith's portrait.
  Other characters' Void skins stay at 1,200.

- **Levels end at a glowing diamond** — every level's climb now ends on the
  summit floor with a diamond to touch, 20 m along the floor from the ladder
  that reaches it; crossing the goal height no longer finishes the run. The
  route bot runs to the diamond, and season 1 is regenerated with the new
  finish (LEVEL_SPEC_VERSION 4, LEVEL_SIM_VERSION 4).

- **Pay for gems on the web from iPhone** — App Store gem packs now cost
  30% more than the web price, passing Apple's commission on ($6.49,
  $12.99, $25.99, $64.99; `appleUsdCents`, set in App Store Connect). On the
  US App Store the iOS gem-pack sheet also offers each pack at its web price
  through Stripe Checkout in the browser. `GET /api/shop` returns
  `webCheckout`; `IOS_WEB_CHECKOUT=off` hides the option without a release.

- **Shop, gems and paid Void skins (mobile)** — a Shop tab with a gem
  balance and every character's paid Wraith-style skin (`<id>-void`,
  1,200 gems), and a Skin Details screen (Classic / Void / coming soon,
  live preview, price and balance after purchase, Purchase and Equip) after
  the store design. The Wraith is now bought for 2,000 gems; the Gecko is
  free after the tutorial. Gem packs are App Store consumables on iOS
  (`POST /api/gems/apple`, signed transactions verified against Apple's
  root) and Stripe Checkout elsewhere (`POST /api/gems/checkout`, webhook
  `gem_pack`). New routes `GET /api/shop`, `POST /api/shop/buy`; new
  column `users.gems` and tables `gem_ledger`, `gem_purchases`,
  `owned_characters` (migration `20260929000000_shop_gems`). App Store
  products must be created before the iOS build (docs/deploy.md). Only
  Production App Store purchases credit gems, except for the accounts in
  `APPLE_IAP_SANDBOX_UIDS`; `@capgo/native-purchases` is patched so
  StoreKit transactions are finished only after the server credits them.

- **Daily Climb leaderboard (web and mobile)** — one server-seeded tower per
  UTC day with a verified daily board. Ranks gains All-time | Today tabs
  under Global | Friends, a status pill (climber count, friend count on
  Friends, reset countdown on Today) and a pinned own row. New routes:
  `GET /api/climb/daily`, `POST /api/climb/daily/result` (re-simulates the
  replay and saves the server's peak), `GET /api/climb/daily/leaderboard`
  and `GET /api/climb/daily/leaderboard/friends`. New tables
  `daily_climb_scores` and `daily_climb_replays` (migrations
  `20260926000000_add_daily_climb_scores`,
  `20260926010000_add_daily_climb_replays`). Deploy the server before the
  mobile build (docs/deploy.md). PR:
  https://github.com/leeran7/building-blocks/pull/155

### Security

- **Daily seed is a server secret** — the tower seed is
  HMAC-SHA256(`DAILY_SEED_SECRET`, day), so it cannot be derived on a device
  before the day opens. New required env var `DAILY_SEED_SECRET` (min 32
  chars); the daily routes fail closed with 503 without it. Daily results
  carry `simVersion` (409 on mismatch), decompression is output-capped,
  copied replays are refused, and open daily replay links stay off public
  creator pages for 48 h.
- **`pnpm db:migrate:local`** refuses to run Prisma migrate unless both
  `DATABASE_URL` and `DIRECT_URL` point at localhost.

### Removed

- **Paid Stacks fully deprecated & removed** — the original Stripe monetization
  (paid listings buying permanent altitude on per-category towers) is gone,
  superseded by Paid 1v1 Battles. Dropped the `blocks`, `season_state`, and
  `payments` tables (migration `20260910060000_drop_paid_stacks`); deleted the
  `blocks`/`seasons`/`payments` data layer, the `src/engine` economics and
  `src/views` view-crediting modules, and the paid routes (`/stack`, `/submit`,
  `/go`, `/b`, `/browse`, `/tower`, `/api/checkout`, `/api/tower`,
  `/api/internal/credit-view`, admin hide/refund/season-rollover) plus their UI
  (TowerDirectory, CategoryShell, InlineTower, HowItWorks, RecordPage,
  `Tower/*`). The Stripe webhook now only handles credits top-ups (the
  dead-letter path is preserved); creator profiles, the homepage, sitemap,
  `/rules`, and the terms/privacy copy were updated to reflect duels-only
  monetization. The free Climb game, Duels, credits wallet, and creator handles
  are untouched.

### Changed

- **No Super Jump or Jetpack start on early levels** — levels 1-45 (episodes
  1-3) never start a run with a super jump or jetpack, whether from a win
  streak, stuck help or an owned booster; a 5-streak there earns the rapid
  climb instead, the booster picker hides them, and star chests opened before
  L46 do not hold them. The random orb was already never a start power-up.
  Both still spawn as orbs from their unlock levels. Server and mobile share
  `startBoosterTypes` (`EARLY_START_LAST_LEVEL = 45`).

- **Climb Feel 1.25× (presentation only)** — amplify The Climb identity on
  climb-facing surfaces (~1.25× HUD, shake, grain/topo, and climb-scoped enter /
  reveal / groundRise / punch motion). Shared ASCENT baselines for paid/auth
  shells stay frozen. Game physics, `RAPID_CLIMB_MULT`, score envelopes, Stripe,
  and schema are untouched. **Giant** now strides over small slab hurdles while
  active. **Open:** OQ-1 free-leaderboard trust (client `peakY` / F-1) is not
  closed by this pass. PR:
  https://github.com/leeran7/building-blocks/pull/80

### Infrastructure

- **CI required to merge into `main`** — workflow job names are now the
  GitHub check contexts; an aggregator job `CI` fails unless both the app
  and orchestrator jobs succeed. Payload:
  `.github/rulesets/require-ci-on-main.json`. A repo admin must create that
  ruleset in GitHub Settings (the GitHub App cannot). Until then, GitHub
  will still merge red PRs.

## [1.0.0] - 2026-08-23

### Features

- **Inflation-based link leaderboard engine** — links earn altitude based on view count using a configurable doubling curve (`DOUBLE_EVERY_K`). Rankings are recalculated on every poll cycle.
- **Tower leaderboard view** — real-time animated leaderboard (`/`) showing all active blocks with rank, altitude, URL, and growth indicator. Polls every 5 seconds.
- **FLIP rank animations** — smooth position transitions using the FLIP technique (First, Last, Invert, Play) with per-block stagger (30 ms). Intermediate blocks animate with slide-out/slide-in and settle overshoot. Respects `prefers-reduced-motion` via cross-fade fallback.
- **Link submission and top-up via Stripe Checkout** — users submit a URL and pay to place or boost a block. Stripe Checkout session created server-side; webhook confirms payment before crediting views.
- **Slug-based block detail pages** (`/b/[slug]`) — per-link page showing rank history, altitude, growth rate, top-up CTA, and loopable `RankAnimation` component demonstrating FLIP animation.
- **OG image generation** (`/api/og`) — dynamic Open Graph image per block rendered server-side using `@vercel/og`.
- **View-counting pipeline** — edge middleware intercepts page loads, extracts IP + User-Agent + session ID, deduplicates within a rolling window using Upstash Redis, then credits the block via the internal `credit-view` API. Per-IP and per-session caps enforce integrity.
- **Season rollover** — active seasons expire after a configurable duration. `rolloverSeason()` archives the current season and creates a fresh one atomically under a DB partial unique index (`WHERE is_active = true`) to prevent duplicates.
- **Admin API** — Bearer-token-protected endpoints for seeding views, inspecting state, and triggering season transitions.
- **Prisma schema with integrity constraints** — PostgreSQL schema with CHECK constraints on altitude and growth values; `$queryRaw UPDATE ... RETURNING` used in `incrementSeasonViews` to eliminate TOCTOU races.
- **RankAnimation standalone component** — loopable FLIP animation component on block detail pages; cycles every 3.2 s between two synthetic block states for demonstration without live data.

### Security

- **Hardcoded token fallback removed** — `INTERNAL_TOKEN` no longer falls back to a static string; the server fails closed (500) if the environment variable is unset, preventing unauthenticated access to internal credit-view routes.
- **HMAC-signed view payloads** — the edge middleware signs `ip`/`sessionId`/`expiry` with `INTERNAL_TOKEN` before forwarding to the internal route; the route verifies the signature and rejects replayed or forged payloads.
- **Rate limiting on credit-view** — Upstash Redis sliding-window rate limiter applied per IP at the internal route in addition to the dedup cap.
- **Stripe webhook signature verification** — all payment events validated with `stripe.webhooks.constructEvent` using `STRIPE_WEBHOOK_SECRET` before any state change.
- **Admin route Bearer-token auth** — all `/api/admin/*` routes require `Authorization: Bearer <ADMIN_TOKEN>`; no unauthenticated writes.
- **SSRF blocklist hardened** — `validateUrl` blocks all RFC-1918 ranges (10/8, 172.16/12, 192.168/16), link-local (169.254/16), loopback, IPv6 ULA/link-local, and encoded-IP variants; enforced in all environments.
- **`display_name` sanitised** — control characters and bidirectional Unicode overrides stripped before storage and logging to prevent log injection and link spoofing.
- **Slug uniqueness with retry** — `slugify` uses a DB UNIQUE constraint plus conflict-retry loop (up to 5 attempts) to guarantee collision-free slugs.
- **Security headers** — `middleware.ts` injects `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a baseline `Content-Security-Policy` on all responses.

### Infrastructure

- **GitHub Actions CI pipeline** (`.github/workflows/ci.yml`) — runs on every push and pull request to `main`; steps: install (pnpm 9 + store cache), `prisma generate`, `tsc --noEmit`, `next lint`, `vitest run`. Node 20.
- **Vercel deployment config** (`app/vercel.json`) — root directory set to `app`; install command `pnpm install --frozen-lockfile`; build command `pnpm build`. Compatible with Vercel's Next.js preset.
- **Database seed script** (`app/prisma/seed.ts`) — bootstraps an initial 90-day active Season if none exists; safe to re-run (idempotent).
- **Environment variable documentation** (`app/.env.example`) — documents all required variables: `DATABASE_URL`, `DIRECT_URL` (Neon direct connection), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `INTERNAL_TOKEN`, `ADMIN_TOKEN`, `BASE_URL`.
- **83 passing tests** — 5 Vitest test files covering engine logic, view-counting pipeline, slug generation, URL validation, and season rollover. Zero failures.
- **TypeScript strict mode** — full `tsc --noEmit` clean across all 70 source files.

[1.0.0]: https://github.com/leeran7/building-blocks/releases/tag/v1.0.0
