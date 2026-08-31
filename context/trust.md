# Trust boundaries

Security-reviewer and backend start here. These are **this product’s**
irreversible or money-adjacent writes — not generic OWASP.

1. **Client-submitted climb scores.** `peakY` persisted with monotonic
   `Math.max` cannot be lowered later. Treat as a hard trust boundary:
   server-derive or reject. A comment that says verification happens
   elsewhere is not a control until that path exists.
   **Client-submitted climb board** (`mobile` | `desktop`) chooses which
   irreversible ranking that peak is written to. Allow-list only; omit
   → mobile (product default); anything else → 400. Same spoofability
   as `peakY` — not a payout board.
2. **Stripe webhooks credit altitude.** Gate on the provider’s
   `payment_status` (or equivalent success state), not merely event type.
   A 4xx on an unresolvable reference permanently drops a captured payment
   on providers that do not retry 4xx — dead-letter and ack 2xx when the
   event cannot be applied.
3. **`INTERNAL_TOKEN` and admin bearer.** Use the repo’s constant-time
   compare helper. New token-authenticated routes get the same rate limiter
   as the existing privileged routes.
4. **Do not forward secrets to URLs derived from the request** (host
   header, origin, redirects).
5. **Middleware is presence-only.** Authorization lives in route handlers
   (`requireAuth` / `requireAdmin`). Do not treat middleware as an access
   control layer.
6. **Allow-list parsers, reject never default.** User-keyed lookups use
   `Object.hasOwn` (or equivalent). Write-on-read `getOrCreate` on public
   GET paths creates ghost records — confine creation to authenticated
   write paths and grep every caller of the symbol.
