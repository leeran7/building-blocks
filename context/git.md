# Git

- **Default branch:** `main`
- **Remote for this GitHub repo:** `origin`
  (`github.com/leeran7/building-blocks`). Push feature branches with
  `git push -u origin <branch>`.
- **Not trunk-only in Cloud Agent runs:** open a PR against `main` unless
  a human explicitly says to push `main`.
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

## Parallel threads into one PR

Several threads or subagents working at once each open a PR into a
`feat/<topic>` branch, and one PR takes that branch into `main`. The recipe is in
`skills/github/feature-branch.md`. What is specific to this repo:

- **Level System conflict hotspots:** `mobile/src/components/levels/LevelResultCard.tsx`,
  `mobile/src/screens/LevelPlayScreen.tsx`, `mobile/src/components/levels/LevelRun.tsx`,
  `tests/components/mobileLevelScreens.test.tsx` (all under `app/`), and the
  shared `LevelRunReport` and `pars` types. A new required field on one
  branch breaks the other branches' fixtures, and only `pnpm typecheck` shows it.
- **Shared selects:** `OPEN_TICKET_SELECT` in `app/src/db/levels.ts`. When you
  merge, check that a column one branch needs survived the other branch's refactor.
- **Season data:** regenerate `pnpm season:generate 1` only when a branch changes
  level geometry (`git diff main...<branch> -- app/src/game`). A branch that
  already committed the regenerated season needs nothing more.
- **Deploy prerequisites** go in the trunk PR body, for example `STAR_CHEST_SECRET`
  in Vercel, without which star chests never open in production.
- Level System work merges into `main` only on Leeran's go. Merging into a
  Level System feature branch needs green CI only.
