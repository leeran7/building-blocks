# Tower — Production Incident Runbook (v1.0.0)

This runbook covers on-call response procedures for Tower in production. It is the first document to open during an incident.

---

## Key metrics to watch

| Metric | Description | Source |
|--------|-------------|--------|
| `/api/tower` p95 latency | Time to first byte for the main tower data feed | Vercel Analytics / APM |
| View pipeline hit rate | Ratio of credited views to total view attempts | Structured logs (`event: view_credited` vs `view_rejected`) |
| Stripe webhook delivery rate | Percentage of `checkout.session.completed` events successfully processed | Stripe Dashboard > Developers > Webhooks |
| Redis error rate | Failed Upstash REST calls (connection errors, token errors, timeouts) | Upstash Redis dashboard / Vercel function logs |
| DB connection pool utilization | Active vs max connections on Neon/Supabase PgBouncer | Neon dashboard / Supabase dashboard |

---

## Alert thresholds

| Alert | Threshold | Severity | Action |
|-------|-----------|----------|--------|
| `/api/tower` p95 latency | > 500 ms | High | Check DB query plan, Redis latency, cold-start rate |
| Application error rate | > 1% of requests | High | Check Vercel function logs for stack traces |
| Stripe webhook delivery rate | < 99% | Critical | Check webhook signing secret, inspect failed deliveries in Stripe dashboard |
| Redis error rate | > 0.5% of Redis calls | High | Check Upstash token validity, network connectivity |
| DB connection pool exhaustion | Pool at 100% utilization | Critical | Increase pool size or scale DB tier immediately |

---

## On-call checklist

Work through these steps in order when an incident is declared.

### 1. Check Vercel function logs

1. Open **Vercel Dashboard > Project > Deployments > [active deployment] > Functions**.
2. Filter by function path (`/api/tower`, `/api/webhook/stripe`, `/api/og`).
3. Look for `500` status codes, unhandled exceptions, or timeout logs (`Function execution timed out`).
4. Structured log lines with `"level":"error"` contain the full stack trace.

### 2. Check Upstash Redis dashboard

1. Open **Upstash Console > Databases > [tower-db]**.
2. Check:
   - **Command latency** (p99 should be < 10 ms).
   - **Error count** in the last 5 minutes.
   - **Token status** — if token is expired or rotated, all Redis calls will return 401.
3. If the token is invalid, rotate it immediately (see Common Failures below).

### 3. Check Neon DB connection pool

1. Open **Neon Dashboard > [project] > Monitoring**.
2. Check **Active connections** vs the configured pool max.
3. If the pool is exhausted, the app returns `P2024` Prisma errors ("timed out fetching a connection").
4. As a temporary measure, reduce traffic or scale the Neon compute tier.

### 4. Check Stripe dashboard

1. Open **Stripe Dashboard > Developers > Webhooks > [endpoint]**.
2. Review **Recent deliveries** for failed attempts.
3. A delivery fails with HTTP 400 when the `STRIPE_WEBHOOK_SECRET` does not match the signing secret registered for the endpoint.
4. A delivery fails with HTTP 500 when the Tower handler threw an unhandled exception — check Vercel logs for the corresponding timestamp.

---

## Common failures and fixes

### DB connection pool exhausted

**Symptom:** Prisma error `P2024: Timed out fetching a connection from the connection pool`. High latency or 500 errors on `/api/tower`.

**Root cause:** Too many concurrent Next.js function invocations competing for a limited number of PgBouncer connections.

**Fix:**
1. In Vercel, go to **Settings > Environment Variables** and update `DATABASE_URL` to increase `connection_limit` and `pool_timeout` parameters:
   ```
   postgresql://...?pgbouncer=true&connect_timeout=15&connection_limit=10&pool_timeout=30
   ```
2. Redeploy (or the change applies on next cold start).
3. Long-term: upgrade the Neon compute tier or enable connection pooling with a higher max.

---

### Redis token expired or rotated

**Symptom:** All view-credit and dedup checks fail. Logs show `401 Unauthorized` from Upstash REST calls. Views may be double-counted or entirely blocked.

**Root cause:** `UPSTASH_REDIS_REST_TOKEN` is stale — the token was rotated in Upstash console but not updated in Vercel.

**Fix:**
1. In Upstash Console, go to **Database > REST API** and copy the current token.
2. In Vercel Dashboard, go to **Settings > Environment Variables**, update `UPSTASH_REDIS_REST_TOKEN` with the new value.
3. Trigger a redeployment (Vercel applies env var changes on the next deploy).
4. Confirm Redis calls succeed by watching function logs for `event: view_credited`.

---

### INTERNAL_TOKEN mismatch

**Symptom:** The view-credit route (`/api/tower/credit-view`) returns HTTP 401 for all requests. Views are never credited. Logs show `"error":"invalid token"` on the credit-view handler.

**Root cause:** The `INTERNAL_TOKEN` environment variable is not consistent between the Edge middleware (which generates the signed payload) and the Node.js credit-view route (which validates it). This happens when the variable is set in one deployment context but not another (e.g., Preview vs Production), or when it was recently rotated in only one place.

**Fix:**
1. Generate a fresh 32-byte hex token:
   ```bash
   openssl rand -hex 32
   ```
2. In Vercel Dashboard > **Settings > Environment Variables**, set `INTERNAL_TOKEN` to the same value for **all environments** (Production, Preview, Development).
3. Redeploy. Both Edge middleware and the Node.js route will now share the same token.
4. Validate by triggering a view and confirming `event: view_credited` appears in logs.

---

## Rollback procedure

### Option A — Vercel instant rollback (recommended, < 30 seconds)

1. Open **Vercel Dashboard > Deployments**.
2. Find the last known-good deployment (the one before the bad deploy).
3. Click the **...** menu next to it and select **Promote to Production**.
4. Vercel instantly switches traffic to that deployment with no rebuild.

### Option B — CLI rollback

```bash
vercel rollback
```

This promotes the previous successful production deployment.

### Option C — Git revert

Use when the issue is in code that was merged:

```bash
git revert HEAD --no-edit
git push origin main
```

Vercel detects the push and starts a new production build automatically.

### Database rollback

Schema migrations should only be rolled back after the application is already running on a previous version (Option A or B first). Then:

```bash
# Apply the down-migration SQL manually
psql "$DIRECT_URL" -f prisma/migrations/<migration_name>/down.sql

# Remove the migration from Prisma's migration history
psql "$DIRECT_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name = '<migration_name>';"
```

---

## Escalation

If the incident cannot be resolved within 30 minutes using this runbook, escalate with:
- A link to the failing Vercel deployment and its function logs.
- The relevant structured log lines (copy the JSON objects with `"level":"error"`).
- The Stripe webhook delivery attempt ID (if webhook-related).
- Current values of `DATABASE_URL` pool parameters (redact credentials).
