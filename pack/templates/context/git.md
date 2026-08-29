# Git

- **Default branch:** `main`
- **Remote:** `origin`
- **Pull requests:** yes / trunk-based: no
- **Review then push:** agent review (`skills/closed-loop/host.md`) before merge.
- **CI required to merge:** yes / no
- **Required check names:** (must match `jobs.*.name` in `.github/workflows/`)
- **Ruleset payload:** (a workflow that only *runs* on PRs is not a merge gate; apply in GitHub Settings → Rules)
