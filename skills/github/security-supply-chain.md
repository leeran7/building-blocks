# Supply chain and repository security

## CODEOWNERS

- Path-based owners in `CODEOWNERS` (repo root, `docs/`, or `.github/`).
- Require owner review via ruleset when trunk must not land without domain
  approval.

## Dependabot

- **Version updates:** `.github/dependabot.yml` -- grouped updates where
  possible.
- **Security updates:** alerts + optional auto-PRs.
- **Auto-triage rules:** dismiss/snooze based on severity, package, CWE.

## Secret scanning & push protection

- Enable secret scanning and **push protection**.
- Never commit tokens; rotate if a scan alerts.

## Actions security

- Least-privilege `permissions:` on workflows.
- Never give production secrets to `pull_request` jobs.
- Avoid `pull_request_target` entirely unless a safe pattern exists.
- Pin third-party actions by full commit SHA.

## Agent checklist

1. Confirm CODEOWNERS + required reviews in `context/git.md`.
2. Never recommend disabling secret scanning or required checks.
3. Hand code fixes to implementer; workflow hardening to the CI-CD skill.
