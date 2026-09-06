# Security review — lava catch-up leeway 250m

- **agent:** security-reviewer
- **status:** success
- **timestamp:** 2026-09-06T20:10:28Z
- **branch:** `cursor/lava-catchup-leeway-250-152b` (base `main`)
- **commit:** `aa19b4d`
- **goal:** Raise `HAZARD_CATCHUP_LEAD_M` from 200m to 250m

## Verdict

No security regression. Game-balance constant only; anti-cheat still uses the same deterministic catch-up formula — only the lead threshold moved.

## Findings

| severity | owasp | location | issue |
|----------|-------|----------|-------|
| info | — | `app/src/game/hazard.ts` (`HAZARD_CATCHUP_LEAD_M`) | Threshold 200→250 only. `hazardCatchupTimeScale` body identical to `main`: `leadM > HAZARD_CATCHUP_LEAD_M + 1e-6 ? HAZARD_CATCHUP_TIME_SCALE : 1`. `HAZARD_CATCHUP_TIME_SCALE` still 1.25. |
| info | A01 | delta vs `main` | No auth, payments, API, middleware, DB, or network surface. Secret scan clean. No lockfile / dep changes. |
| info | A04 | `simulation.ts` + re-sim anti-cheat | Catch-up remains a shared deterministic clock multiplier in `stepMatch`; client and server re-sim stay aligned on the same constant. |

**critical:** 0 · **warning:** 0 · **info:** 3

## Trust boundaries

Untouched: climb scores, Stripe webhooks, `INTERNAL_TOKEN`, host-derived URLs, middleware authz, allow-list parsers. Free-leaderboard OQ remains open / out of scope.

## Exit criteria

- `secret_scan_clean`: true
- `no_auth_payment_network_delta`: true
- `catchup_formula_unchanged`: true
- `only_threshold_moved`: true
- `no_critical_security_findings`: true

## Learnings

- **metric:** Lava leeway 250m security review: 0 critical, 0 warning, 3 info. Constant-only; formula identity confirmed vs `main`.
- **pattern:** Balance-threshold bumps that only change a shared exported constant used by `hazardCatchupTimeScale` / `stepMatch` are not anti-cheat regressions when the predicate and multiplier are byte-identical aside from the threshold value.
- **exception:** Free-leaderboard trust boundary stays open; this delta does not close F-1.

Canonical JSON: `loop/handoffs/security-reviewer-2026-09-06T201028Z.json`
