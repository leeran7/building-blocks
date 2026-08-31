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
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) — obtained after registering the endpoint |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...`) — exposed to the browser |
| `INTERNAL_TOKEN` | Random secret (min 32 chars) — signs edge-to-internal view-credit payloads; **must be set or server will refuse to start** |
| `ADMIN_TOKEN` | Random secret (min 32 chars) — Bearer token for admin API routes |
| `BASE_URL` | Production URL without trailing slash (e.g. `https://tower.example.com`) |

Generate `INTERNAL_TOKEN` and `ADMIN_TOKEN` with:

```bash
openssl rand -hex 32
```

---

## Deploy steps

### Option A — Push to main (recommended)

1. Connect the repository to a Vercel project.
2. In Vercel project settings set **Root Directory** to `app`.
3. Vercel will auto-detect Next.js and use `pnpm install --frozen-lockfile` + `pnpm build`.
4. Push to `main`; Vercel triggers a production deployment automatically
   **only if `app/` changed.** `app/vercel.json` `ignoreCommand` skips the
   build (no migrate, no Fluid CPU) when the commit only touches loop notes,
   the learnings ledger, docs, or other paths outside `app/`.

### Option B — Manual deploy with Vercel CLI

```bash
cd /path/to/building-blocks/app
vercel --prod
```

Vercel will use `vercel.json` in the `app/` directory.

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

## Stripe webhook registration

After the first production deploy, register the webhook endpoint in the Stripe dashboard:

1. Go to **Stripe Dashboard > Developers > Webhooks > Add endpoint**.
2. Set the endpoint URL to:
   ```
   https://<domain>/api/webhook/stripe
   ```
3. Select the event **`checkout.session.completed`**.
4. Click **Add endpoint**.
5. Copy the **Signing secret** (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` in Vercel, then redeploy (or trigger a redeployment via Vercel dashboard).

Webhook verification uses `stripe.webhooks.constructEvent`; payloads with invalid signatures are rejected with HTTP 400.

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
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `INTERNAL_TOKEN`
- `ADMIN_TOKEN`
