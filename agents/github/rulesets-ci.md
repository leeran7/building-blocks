# Rulesets, branch protection, and Actions CI

## Rulesets over ad-hoc branch protection

Prefer **repository rulesets** (versionable JSON, org-bypass controls, clear
enforcement) over one-off classic branch protection when both exist. Keep the
canonical payload in-repo (e.g. `.github/rulesets/*.json`) and apply via UI or
API — committed JSON does **not** auto-apply.

Typical trunk rules:

- Require a pull request before merging
- Required approving review count (and CODEOWNERS if used)
- Required status checks — names must equal Actions `jobs.<id>.name` (or the
  check context string GitHub shows)
- Block force pushes and branch deletion on trunk
- Optional: require linear history, restrict who can push

Apply / verify (read-only by default):

```bash
gh api repos/{owner}/{repo}/rulesets
# Listing is fine. Creating/updating enforcement:active rulesets needs a
# human — never use the API to drop required checks or add bypass actors
# to unblock a PR.
```

Record required check **names** in `context/git.md`. Integrator and github
agents treat that list as source of truth.

## Critical distinction

| Mechanism | What it does |
|-----------|----------------|
| `on: pull_request` in a workflow | Runs jobs; reports checks |
| Ruleset `required_status_checks` | **Blocks merge** until those checks succeed |

A green Actions run that is not required is honor-system only. Never call CI a
merge gate without the ruleset (or classic protection) requiring it.

## Actions hygiene

- Default: pin third-party Actions by full commit SHA (kernel gate 21). Do not
  wait for an org policy to ask.
- Cache dependency stores keyed off the lockfile hash.
- Use the same Node/runtime as production (`context/profile.json`).
- **Never** give production secrets to any `pull_request` job — same-repo
  branches can exfiltrate them as easily as forks (kernel gate 21). Prefer
  OIDC / environment-scoped secrets on `push` to trunk or trusted
  `workflow_dispatch` / deployment workflows instead.
- Do **not** use `pull_request_target` to “get secrets onto a PR.” It checks
  out untrusted PR code in a privileged context when misused. Avoid it unless
  a human-owned playbook already defines a safe pattern with no untrusted
  checkout + secrets.
- Fail closed: do not `continue-on-error` on required jobs.
- Never loosen or delete required checks via `gh api` to unblock a merge —
  fix the failing job or escalate to a human.

## Stack-aware CI

Every stack layer triggers trunk-targeted `pull_request` workflows. Gate
expensive jobs with `github.event.pull_request.stack` (see `stacked-prs.md`).
Do not “fix” CI by dropping required checks for mid-stack PRs — trunk
policy applies to every layer.

## Agent checklist

1. Diff workflow `name:` / `jobs.*.name` against `context/git.md`.
2. Confirm a ruleset (or protection rule) requires those exact strings.
3. If adding a new required job: update workflow **and** ruleset payload **and**
   `context/git.md` in the same change set (devops owns the workflow diff;
   github owns the policy advice).
