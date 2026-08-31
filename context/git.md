# Git

- **Default branch:** `main`
- **Remote for this GitHub repo:** `origin`
  (`github.com/leeran7/building-blocks`). Push feature branches with
  `git push -u origin <branch>`.
- **Not trunk-only in Cloud Agent runs:** open a PR against `main` unless
  a human explicitly says to push `main`.
- **Do not commit loop notes.** `loop/spec.md`, `loop/architecture.md`,
  `loop/schema-target.md`, `loop/cost.md`, `loop/handoffs/`, and
  `loop/state.json` are gitignored. Do not `git add -f` them. A GitHub
  commit of those files is enough for Vercel to start a production deploy
  even though the Next app did not change. Tracked under `loop/`: the
  learnings ledger (`loop/learnings.md`, `loop/learnings.jsonl`) and
  `loop/INDEX.md`. Package-upgrade architecture lives at
  `archive/package-upgrade.md`. `app/vercel.json` `ignoreCommand` skips
  the Vercel build when `app/` is unchanged, so a ledger-only merge does
  not redeploy.
- **Review then push:** agent review (see `skills/closed-loop/host.md`)
  before merge. Do not push-then-review except production hotfixes.
- **CI is required to merge into `main`.** A workflow that *runs* on a
  pull request is not a merge gate. GitHub must require the check names
  via the ruleset in `.github/rulesets/require-ci-on-main.json`.
  - Required checks (must match `jobs.*.name` in `.github/workflows/ci.yml`):
    `Lint, Typecheck, and Test`, `Orchestrator loop`, `CI`.
  - Apply in the GitHub UI:
    https://github.com/leeran7/building-blocks/settings/rules
    (payload: `.github/rulesets/require-ci-on-main.json`)
  - **Proven not a gate:** PR #30 merged 2026-08-29 with `Orchestrator loop`
    **FAILURE** (Actions run 33267623536). After the ruleset is active,
    that merge is impossible.
