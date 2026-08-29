# Repository rulesets

GitHub does not read these files automatically. A repo admin must create
the ruleset in the GitHub UI. The Cursor GitHub App cannot do this
(`403 Resource not accessible by integration`).

## Require CI on main

Reference payload: `require-ci-on-main.json`

Open **Settings → Rules → Rulesets → New branch ruleset**:
https://github.com/leeran7/building-blocks/settings/rules

- Enforcement: Active
- Target: default branch (`main`)
- Require status checks to pass, including **Require branches to be up to date**
- Checks (must match `jobs.*.name` in `.github/workflows/ci.yml`):
  - `Lint, Typecheck, and Test`
  - `Orchestrator loop`
  - `CI`
- Block force pushes
- Block deletions
- No bypass actors
