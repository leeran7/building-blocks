# Changelog

All notable changes to Tower are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Features

- **Canonical climb-recording URLs** — a saved climb with a replay token is
  shareable at a short, stable `/r/{id}` link (production origin
  `https://www.doomstack.lol`). That replaces the long `/play?r={token}` URL
  that burns X's 280-character limit. Anonymous and unsaved runs still play
  back via `/play?r=`; those token links keep generic play metadata.
- **Unique Open Graph and Twitter cards** — `/r/{id}` recordings and
  `/b/[slug]` listings emit unique `og:title`, `og:description`, `og:image`,
  `og:url`, and `twitter:card=summary_large_image`. Images use ASCENT tokens
  (void / signal / ember): landscape 1200×630 for X/OG and square 1080×1080
  for TikTok. Listing cards no longer use the old sky-blue palette.
- **Share payload JSON** — `GET /api/share/recording/{id}` returns a public
  payload (`title`, `caption`, `description`, `hashtags`, `cta`,
  `canonicalUrl`, `imageUrl`) so an X / TikTok / YouTube marketing agent can
  fill drafts without inventing copy or overflowing platform limits. Over-limit
  captions are rejected, not truncated.
- **Share UI** — ShareRun and dashboard replays offer Share on X (tweet web
  intent), copy TikTok caption, copy YouTube title and description, and copy
  link. TikTok and YouTube have no public compose-with-URL intent; the UI
  copies text instead of inventing a compose URL.
- **robots.txt and sitemap** — crawlers may fetch `/`, `/play`, `/climb`,
  `/b/`, `/r/`, and `/api/og`. The sitemap lists home, play, climb, and existing
  `/b/{slug}` listings. Climb recordings are not bulk-listed in the sitemap.
- **Mobile / desktop climb leaderboards** — touch (full-bleed) and keyboard
  (9:16) scores rank on separate boards. `/climb` defaults to mobile;
  `?board=desktop` is the other board. Untagged historical records cut over
  to desktop; omit-POST still writes mobile.

### Security

- **TikTok / ByteDance crawlers classified as bots** — `tiktok`,
  `bytespider`, and `bytedance` user-agents skip paid-stack view credit so
  unfurls do not inflate listing altitude, and they still receive the HTML
  document (not 401/403).

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
