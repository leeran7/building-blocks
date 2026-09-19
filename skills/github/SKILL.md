---
name: github
description: >-
  GitHub platform expertise. Stacked PRs, rulesets, merge queue, Actions CI,
  issues/Projects, and supply-chain security. Use when opening or stacking
  PRs, designing branch policy, or advising on GitHub workflows.
---

# GitHub Platform Skill

How work lands on the remote. Prefer small, reviewable layers; never weaken
merge gates to go faster. Read `context/git.md` before any push, PR, stack,
or ruleset advice.

## Deep references

| Topic | File |
|-------|------|
| Stacked PRs + `gh stack` | `skills/github/stacked-prs.md` |
| PR creation / review / merge | `skills/github/pull-requests.md` |
| Rulesets, required checks, Actions | `skills/github/rulesets-ci.md` |
| Merge queue + `merge_group` | `skills/github/merge-queue.md` |
| Issues, types, fields, Projects | `skills/github/issues-projects.md` |
| Dependabot, CODEOWNERS, secrets | `skills/github/security-supply-chain.md` |

Read the relevant partial before advising on that topic.

## Key rules

1. Required status checks must be **ruleset-gated**, not merely `on:
   pull_request`. Check names must match `jobs.*.name` in workflows.
2. Never give production secrets to any `pull_request` job.
3. Pin third-party Actions by full commit SHA.
4. Prefer **stacked PRs** when a change is large, layered, or blocked on an
   unmerged foundation. Prefer a **single PR** when the diff is one reviewable
   concern.
5. If a merge queue exists, required workflows must also run on
   `merge_group`.
6. Never force-push the default branch, merge red/missing/skipped required
   checks, or disable rules to go green.
