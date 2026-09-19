# Rulesets, branch protection, and Actions CI

## Rulesets over ad-hoc branch protection

Prefer **repository rulesets** (versionable JSON, org-bypass controls) over
classic branch protection. Typical trunk rules:

- Require a pull request before merging
- Required approving review count (and CODEOWNERS)
- Required status checks -- names must equal Actions `jobs.<id>.name`
- Block force pushes and branch deletion on trunk

## Critical distinction

| Mechanism | What it does |
|-----------|--------------|
| `on: pull_request` in a workflow | Runs jobs; reports checks |
| Ruleset `required_status_checks` | **Blocks merge** until those checks succeed |

A green Actions run that is not required is honor-system only.

## Actions hygiene

- Pin third-party Actions by full commit SHA.
- Cache dependency stores keyed off the lockfile hash.
- Same Node/runtime as production (`context/profile.json`).
- **Never** give production secrets to `pull_request` jobs.
- Do **not** use `pull_request_target` unless a human playbook defines a safe
  pattern.
- Fail closed: no `continue-on-error` on required jobs.
- Never loosen required checks via API to unblock a merge.
