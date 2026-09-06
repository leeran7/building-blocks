---
name: github
description: >-
  GitHub platform expertise: stacked PRs (gh stack), creating and merging
  PRs, rulesets vs honor-system CI, merge queues (merge_group), Issues
  types/fields/sub-issues, Dependabot auto-triage, and CODEOWNERS. Use
  whenever opening PRs, designing branch policy, or choosing stack vs single
  PR. Pair with the `github` agent for closed-loop handoffs.
---

# GitHub skill

Use this skill whenever the task involves GitHub collaboration mechanics —
not application feature code.

## Read first

1. `context/git.md` — trunk, remote, required checks, PR policy for **this**
   repo.
2. Agent entry `agents/github.md` and the partial that matches the task:
   - `agents/github/stacked-prs.md`
   - `agents/github/pull-requests.md`
   - `agents/github/rulesets-ci.md`
   - `agents/github/merge-queue.md`
   - `agents/github/issues-projects.md`
   - `agents/github/security-supply-chain.md`

## Decision: stack or single PR?

| Choose | When |
|--------|------|
| **Single PR** | One reviewable concern; independent of other open branches |
| **Stacked PRs** | Large/layered work; later commits need unmerged foundations; avoid mega-PRs from agents |

Install tooling: `gh extension install github/gh-stack`.

## Decision: is CI a merge gate?

Only if a **ruleset** (or classic protection) requires the check **names**.
`on: pull_request` alone is not a gate. Merge queues additionally need those
checks on `merge_group`.

## Fast commands

```bash
gh pr create / gh pr checks / gh pr merge
gh stack init && gh stack add && gh stack submit
gh stack rebase && gh stack sync --prune
gh api repos/{owner}/{repo}/rulesets
gh issue create --type ... --parent ... --blocked-by ...
```

## Closed-loop

Dispatch the `github` agent (`subagent_type: github`) for stacking strategy,
PR cut plans, or ruleset/merge-queue advice. Integrator still owns green-CI
triage; devops owns workflow file edits; github owns the platform playbook
and `loop/github.md` when policy or a multi-PR stack is involved.
