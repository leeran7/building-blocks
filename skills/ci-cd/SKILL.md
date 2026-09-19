---
name: ci-cd
description: >-
  CI/CD pipeline design, environment config, and deployment. Use when setting up
  workflows, configuring environments, or hardening the build-test-deploy chain.
---

# CI/CD Skill

Deterministic pipelines that fail closed. Every step must be reproducible
locally and in CI with the same result.

## Pipeline shape

1. **Install** with frozen lockfile (`--frozen-lockfile` / `npm ci`). Never
   allow `install` to mutate the lockfile in CI.
2. **Typecheck** before tests — catch type errors without waiting for the full
   suite.
3. **Lint** in parallel with typecheck when possible.
4. **Test** with coverage thresholds from `context/gates.json`.
5. **Build** production bundle. Fail if bundle size exceeds the gate.
6. **Deploy** to staging, then production. Never skip staging for a hotfix
   unless a human runbook says so.

## Environment config

- Document every env var in `.env.example` — no secret values, just names and
  descriptions.
- Validate required env vars at startup; crash immediately on missing vars,
  don't fall back to defaults that hide misconfiguration.
- Match CI runtime (Node version, OS) to production via `context/profile.json`.

## Deployment

- Health endpoint at `/health` — returns 200 only when the service is ready to
  serve traffic.
- Deploy config (Dockerfile, serverless.yml, etc.) must match
  `context/profile.json` for runtime, region, and resource limits.
- Zero-downtime deploys: rolling update or blue-green, never stop-start.

## Don't

- Use `continue-on-error` on required jobs
- Give production secrets to `pull_request` jobs
- Skip frozen lockfile install in CI
- Deploy without a passing full pipeline
