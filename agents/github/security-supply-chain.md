# Supply chain and repository security on GitHub

## CODEOWNERS

- Path-based owners in `CODEOWNERS` (repo root, `docs/`, or `.github/`).
- Require owner review via ruleset / protection when the trunk must not land
  without domain approval.
- On stacks, CODEOWNERS is evaluated against the **stack trunk** for every
  layer. A lower PR that changes `CODEOWNERS` does not rewrite rules for
  higher open layers mid-flight — plan ownership edits carefully.

## Dependabot

- **Version updates:** `.github/dependabot.yml` — grouped updates where
  possible to reduce PR noise.
- **Security updates:** alerts + optional auto-PRs.
- **Auto-triage rules:** dismiss/snooze or open PRs based on severity,
  package, CWE, CVE. Custom rules need appropriate plan/Code Security on
  private repos. If you use “open a PR” rules, leave classic Dependabot
  security-update auto-PRs disabled so rules own the behavior.
- Presets exist for low-impact dev dependencies and malware false positives —
  review before enabling org-wide dismissals.

## Secret scanning & push protection

- Enable secret scanning and **push protection** on orgs/repos that allow it.
- Never commit tokens; rotate if a scan alerts. Agents: scrub `.env`,
  credentials in workflow logs, and pasted `gh` output.

## Actions security

- Least-privilege `permissions:` on workflows (`contents: read` by default).
- Never give production secrets to `pull_request` jobs (same-repo or fork).
- Avoid `pull_request_target` entirely unless a human playbook already defines
  a safe pattern with no untrusted checkout combined with secrets.
- Pin third-party actions by full commit SHA; review `workflow_dispatch` inputs.

## Branch / ruleset safety

- No standing admin bypass for agents.
- Protect default branch deletion and force-push.
- Separate who can edit rulesets from who can merge application code when
  the org supports actor distinctions.

## Agent checklist

1. Before merge advice: confirm CODEOWNERS + required reviews in
   `context/git.md` / ruleset payload.
2. Never recommend disabling secret scanning or required checks to unblock.
3. Hand security-finding fixes that need code changes to implementer;
   workflow permission hardening to devops; policy wording to github handoff.
