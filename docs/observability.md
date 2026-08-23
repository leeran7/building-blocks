# Tower — Observability Setup Guide (v1.0.0)

This guide covers how to instrument and monitor Tower in production. The application already emits structured JSON logs to stdout; Vercel captures these automatically and makes them searchable in the function logs UI and via log drains.

---

## Recommended observability stack

| Tool | Purpose | Setup effort |
|------|---------|-------------|
| **Vercel Analytics** | Web vitals, page performance, geographic distribution | Zero — enable in Vercel project settings |
| **Vercel Function Logs** | Structured application logs, error traces | Zero — logs appear automatically |
| **Sentry** | Error tracking, stack traces, release tracking, user impact | Low — install SDK, set `SENTRY_DSN` env var |
| **Upstash Redis Metrics** | Redis latency, error rate, throughput | Zero — built into Upstash console |
| **Stripe Dashboard** | Webhook delivery, payment volume, failed charges | Zero — built into Stripe console |
| **Neon / Supabase Monitoring** | DB connection pool, query latency, compute utilization | Zero — built into provider dashboards |

---

## Vercel Analytics

1. In the Vercel Dashboard, go to **Project > Analytics** and click **Enable**.
2. This activates the built-in Web Vitals collection (LCP, CLS, FID/INP) for all pages.
3. No code changes required — Next.js 14 emits web vitals automatically.

Key dashboard views to configure:
- **LCP on `/` (Tower home)** — target < 2.5 s.
- **LCP on `/[slug]` (record pages)** — target < 2.5 s.
- **p95 function duration for `/api/tower`** — alert threshold: 500 ms.

---

## Sentry error tracking

### Installation

```bash
cd /path/to/building-blocks/app
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`.

### Environment variable

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

Set this in Vercel Dashboard > Settings > Environment Variables (Production and Preview).

### Recommended Sentry configuration

In `sentry.server.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,          // 10% of transactions for performance
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
  beforeSend(event) {
    // Strip PII from database URLs in breadcrumbs
    return event;
  },
});
```

### Sentry alerts to configure

| Alert | Condition | Notification |
|-------|-----------|-------------|
| New issue in production | Any new unhandled error | Immediate — PagerDuty or Slack |
| Error spike | > 10 errors / minute | Immediate |
| `/api/tower` P95 > 500 ms | Transaction duration threshold | High priority |
| Stripe webhook handler errors | Issues tagged `route:/api/webhook/stripe` | Immediate |

---

## Key events to log

The application already emits the following structured JSON events to stdout. These appear in Vercel Function Logs and can be forwarded to any log aggregation service via a Vercel Log Drain.

### View credited

```json
{
  "event": "view_credited",
  "slug": "<block-slug>",
  "viewer_id": "<hashed-ip-or-session>",
  "altitude": 42,
  "season_id": "<uuid>",
  "timestamp": "<ISO>"
}
```

Indicates a unique view was counted and will contribute to ground rise.

### View rejected

```json
{
  "event": "view_rejected",
  "slug": "<block-slug>",
  "viewer_id": "<hashed-ip-or-session>",
  "reason": "duplicate | rate_limited | invalid_token | season_inactive",
  "timestamp": "<ISO>"
}
```

Indicates a view attempt was rejected. Monitor the `reason` field — a spike in `invalid_token` means `INTERNAL_TOKEN` misconfiguration; a spike in `rate_limited` may indicate a bot or abuse.

### Payment completed

```json
{
  "event": "payment_completed",
  "session_id": "<stripe-checkout-session-id>",
  "block_slug": "<slug>",
  "amount_cents": 4999,
  "altitude_purchased": 10,
  "timestamp": "<ISO>"
}
```

Emitted after a successful `checkout.session.completed` webhook is processed.

### Season rollover

```json
{
  "event": "season_rollover",
  "previous_season_id": "<uuid>",
  "new_season_id": "<uuid>",
  "final_ground_altitude": 17,
  "timestamp": "<ISO>"
}
```

Emitted when a new season is activated. This is a rare, high-value event — any unexpected rollover should be investigated.

---

## Log drain setup (optional but recommended)

To forward logs to a third-party aggregator (Datadog, Axiom, Logtail, etc.):

1. In Vercel Dashboard, go to **Settings > Log Drains > Add Drain**.
2. Select the integration or enter a custom HTTPS endpoint.
3. Choose log sources: **Function Logs** (includes stdout from Next.js API routes).
4. Save. Logs are forwarded in near-real-time.

---

## Dashboard queries

### Vercel Log Search

Filter by structured log fields using the Vercel log search UI or log drain queries:

```
# All view rejections in the last hour
event:view_rejected

# All invalid-token rejections (indicates INTERNAL_TOKEN misconfiguration)
event:view_rejected reason:invalid_token

# All payment completions
event:payment_completed

# All errors
level:error
```

### Sentry queries

```
# Errors on the Stripe webhook route
route:/api/webhook/stripe

# Prisma connection pool errors
P2024

# Redis auth failures
401 Unauthorized Upstash
```

### Upstash metrics to monitor

In the Upstash Console under **Metrics**:
- **Daily commands** — baseline normal traffic; deviations indicate bugs or abuse.
- **Command latency (p99)** — should be < 10 ms; > 50 ms indicates network or region issues.
- **Error count** — any non-zero value warrants investigation.

---

## Structured log format

All Tower application logs follow this envelope:

```json
{
  "level": "info | warn | error",
  "event": "<event-name>",
  "message": "<human-readable>",
  "timestamp": "<ISO-8601>",
  ...event-specific fields
}
```

Error logs additionally include:
```json
{
  "level": "error",
  "error": "<error message>",
  "stack": "<stack trace>",
  "route": "<Next.js route path>"
}
```
