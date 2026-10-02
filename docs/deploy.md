# Tower — Deployment Runbook (v1.0.0)

Step-by-step instructions for deploying the Tower app to production on Vercel.

---

## Prerequisites

### External services

| Service | Purpose | Notes |
|---------|---------|-------|
| **Neon** or **Supabase** | PostgreSQL database | Neon recommended; requires both `DATABASE_URL` (pooled) and `DIRECT_URL` (direct/unpooled) for Prisma migrations |
| **Upstash Redis** | View dedup, rate limiting, session caps | Create a Redis database in the Upstash console; copy REST URL and token |
| **Stripe** | Payment processing, top-up Checkout | Requires a Stripe account with Checkout enabled; collect publishable key, secret key, and webhook signing secret |

### Local tooling

- Node 20+
- pnpm 9 (`npm i -g pnpm@9`)
- Vercel CLI (`npm i -g vercel`) — for manual deploys
- Stripe CLI (`brew install stripe/stripe-cli/stripe`) — for local webhook testing only

---

## Environment variables

Set all of the following in the **Vercel project dashboard** under Settings > Environment Variables. Apply to Production (and optionally Preview).

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled Prisma connection string (e.g. `postgresql://...?pgbouncer=true&connect_timeout=15`) |
| `DIRECT_URL` | Direct (non-pooled) connection string — required by `prisma migrate deploy` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint (e.g. `https://<id>.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` in production, `sk_test_...` in preview/development) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_...`); production may comma-separate live + test secrets |
| `INTERNAL_TOKEN` | Random secret (min 32 chars) — signs edge-to-internal view-credit payloads; **must be set or server will refuse to start** |
| `ADMIN_TOKEN` | Random secret (min 32 chars) — Bearer token for admin API routes |
| `DAILY_SEED_SECRET` | Random secret (min 32 chars) — HMAC key for the Daily Climb tower seed. **If missing or short, `GET /api/climb/daily` and `POST /api/climb/daily/result` return 503** (no fallback seed). Rotating it changes today's tower, so rotate at 00:00 UTC |
| `BASE_URL` | Production URL without trailing slash (`https://www.doomstack.lol`) |
| `APPLE_BUNDLE_ID` | Optional. The iOS bundle id App Store gem packs must be for; defaults to `lol.doomstack.app` (capacitor.config.ts) |
| `APPLE_IAP_SANDBOX_UIDS` | Optional, comma-separated Firebase uids. Only these accounts get gems for Sandbox/TestFlight purchases (which cost nothing); put App Review's demo account here while a build is in review. Everyone else needs a Production purchase |

Generate `INTERNAL_TOKEN`, `ADMIN_TOKEN` and `DAILY_SEED_SECRET` with:

```bash
openssl rand -hex 32
```

---

## Deploy steps

### Option A — Push to main (recommended)

1. Connect the repository to a Vercel project.
2. In Vercel project settings set **Root Directory** to `app`.
3. Vercel will auto-detect Next.js and use `pnpm install --frozen-lockfile` + `pnpm build`.
4. Push to `main`; Vercel triggers a production deployment automatically.

### Option B — Manual deploy with Vercel CLI

```bash
cd /path/to/building-blocks/app
vercel --prod
```

Vercel will use `vercel.json` in the `app/` directory.

### Daily Climb release order

1. **Deploy the server first, then ship the mobile build.** A mobile build
   with the Daily Climb fetches `GET /api/climb/daily` before a daily run can
   start. Against an older server that is a 404, and the app shows "Can't
   load today's tower" to every player. Set `DAILY_SEED_SECRET` first (see
   above); without it the routes answer 503.
2. **`DAILY_SIM_VERSION` locks out installed builds.** The server refuses a
   daily result whose `simVersion` differs from its own
   (`app/src/game/simVersion.ts`) with 409 `SIM_VERSION_MISMATCH`, and the
   app says "update the app to post daily scores". Bumping it (required
   with any change to `stepMatch`, `obstaclesForFloor`, power-ups or hazard
   tuning) therefore stops every installed mobile build from posting to the
   daily board until players update. Ship the store build with the bump and
   deploy the server when it is live. See the runbook.
3. **Stored replays are not versioned.** `REPLAY_VERSION` is the envelope
   format, not the engine, and nothing checks it against the sim. Replays
   stored in `climb_runs.replay_token` and `daily_climb_scores.replay_token`
   are input logs re-simulated with the current engine, so after any engine
   change old `/play?r=` links and stored daily replays can play out
   differently from the run that was scored. Daily scores keep the verified
   `peak_y` and their `sim_version`; the replay is not re-checked later.
   Call this out in the PR of any engine change.

### Local migrations

Never run Prisma migrate locally with only `DATABASE_URL` overridden: Prisma
migrate connects with `DIRECT_URL`, and a shell that exports the production
value would migrate production. Use the guarded script, which refuses
unless both are set and point at localhost:

```bash
L=postgresql://postgres@127.0.0.1:55432/devdb
DATABASE_URL=$L DIRECT_URL=$L pnpm db:migrate:local
```

---

## Post-deploy steps

Run these once after the first successful deploy (and after every schema-changing release):

### 1. Run database migrations

```bash
# From the app/ directory, with DATABASE_URL and DIRECT_URL set in your shell
pnpm db:migrate
```

This runs `prisma migrate deploy` against the production database, applying all pending migrations.

### 2. Seed initial data

```bash
pnpm db:seed
```

This runs `prisma/seed.ts`, which creates an initial 90-day active Season if none exists. The script is idempotent — safe to re-run.

---

## Verify deploy health

After the deploy completes, confirm these two critical paths:

### API health check

```bash
curl -sf https://<domain>/api/tower | jq .
```

Expected: JSON response containing `{ "blocks": [...], "season": { ... } }`.

### OG image check

```bash
curl -sfI "https://<domain>/api/og?slug=<any-valid-slug>"
```

Expected: HTTP 200 with `Content-Type: image/png`.

If either check fails, inspect Vercel Function logs in the dashboard.

---

## Shop: gem packs on the App Store

The iOS app sells gem packs as App Store consumables (`src/lib/gemPacks.ts`).
Before a build with the Shop goes to TestFlight or review:

1. In App Store Connect → the app → Monetization → In-App Purchases, create
   one **Consumable** per pack. The product id is each pack's
   `appleProductId` and the US price is its `appleUsdCents` in
   `src/lib/gemPacks.ts` (the web price plus Apple's 30%: $6.49, $12.99,
   $25.99 and $64.99 today). Add a review screenshot of the gem sheet to
   each.
2. In Xcode, add the **In-App Purchase** capability to the App target. The
   `@capgo/native-purchases` package is already in `CapApp-SPM/Package.swift`.
3. Deploy the server (the migration `20260929000000_shop_gems` and
   `POST /api/gems/apple`) before the mobile build.

No App Store Connect API key is needed: the server verifies each signed
transaction against Apple's root certificate (`src/api/appleJws.ts`).
Sandbox and TestFlight purchases verify too, but they cost nothing, so they
credit gems only for the accounts in `APPLE_IAP_SANDBOX_UIDS`; everyone else
is refused with `SANDBOX`. App Review buys in Sandbox: put the review demo
account's Firebase uid in that variable before submitting. The app finishes
a refused Sandbox transaction, so a purchase made before the uid is listed
is not credited later. Refunds are not clawed back yet; that needs App Store
Server Notifications.

Web and Android buy packs through Stripe Checkout (`POST /api/gems/checkout`,
`metadata.type = "gem_pack"`) on the existing webhook; nothing new to
register.

## Stripe webhook registration

Production and sandbox each have a webhook on:

```
https://www.doomstack.lol/api/webhook/stripe
```

Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`.

| Environment | `STRIPE_SECRET_KEY` | `STRIPE_WEBHOOK_SECRET` |
|-------------|---------------------|-------------------------|
| **Production** | `sk_live_...` | Live `whsec_...` (comma-separate test `whsec_...` if both modes hit prod) |
| **Preview / Development** | `sk_test_...` | Test `whsec_...` |
| **Local** | `sk_test_...` | Output of `stripe listen --forward-to localhost:3000/api/webhook/stripe` |

**Live secret key:** copy `sk_live_...` from [Stripe API keys](https://dashboard.stripe.com/apikeys) (live mode), then:

```bash
cd app
printf '%s' 'sk_live_...' | npx vercel env add STRIPE_SECRET_KEY production --sensitive --yes --force
npx vercel redeploy --target production
```

Webhook verification uses `stripe.webhooks.constructEvent`; invalid signatures return HTTP 400.

---

## Rollback

### Vercel instant rollback

In the Vercel dashboard go to **Deployments**, find the last known-good deployment, and click **Promote to Production**. This is instant and requires no code changes.

### Git-based rollback

```bash
git revert HEAD --no-edit
git push origin main
```

Vercel will build and deploy the reverted commit automatically.

### Database rollback

If a migration must be rolled back, apply the down-migration manually:

```bash
# Connect directly to the database and run the down SQL from prisma/migrations/<migration>/migration.sql
psql "$DIRECT_URL" -f prisma/migrations/<migration_name>/down.sql
```

Then revert the Prisma migration history table entry:

```bash
psql "$DIRECT_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name = '<migration_name>';"
```

---

## Protecting `main` (required CI)

A workflow that *runs* on pull requests is not a merge gate. GitHub will
merge a red PR unless a repository ruleset requires the check names.

1. Merge a revision that includes `.github/workflows/ci.yml` job names
   `Lint, Typecheck, and Test`, `Orchestrator loop`, and `CI` (so those
   checks exist).
2. As a **repo admin**, open **Settings → Rules → Rulesets → New branch
   ruleset** and use `.github/rulesets/README.md` /
   `.github/rulesets/require-ci-on-main.json`.

The Cursor GitHub App cannot create rulesets (API `403`). Until an admin
applies the ruleset, merges can still land with failing CI — PR #30 did
that on 2026-08-29.

---

## GitHub secrets required for CI

The following secrets must be set in **GitHub repository Settings > Secrets and variables > Actions** for the CI pipeline to run correctly:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `INTERNAL_TOKEN`
- `ADMIN_TOKEN`
