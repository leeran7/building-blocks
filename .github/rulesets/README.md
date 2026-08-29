# Repository rulesets

GitHub does not read these files automatically. A repo admin must apply them
once (API or Settings UI). The Cursor GitHub App cannot create rulesets
(`403 Resource not accessible by integration`).

## Require CI on main

Payload: `require-ci-on-main.json`

```bash
yarn apply-github-ruleset --dry-run   # validate payload locally, no GitHub write
yarn apply-github-ruleset             # create or update (needs admin token)
```

Or in the GitHub UI: **Settings → Rules → Rulesets → New branch ruleset**.

- Enforcement: Active
- Target: default branch (`main`)
- Require status checks to pass, including **Require branches to be up to date**
- Checks (must match `jobs.*.name` in `.github/workflows/ci.yml`):
  - `Lint, Typecheck, and Test`
  - `Orchestrator loop`
  - `CI`
- Block force pushes
- Block deletions
