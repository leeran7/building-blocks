# Pull request practices

## Create

```bash
git push -u origin HEAD
gh pr create --base <trunk> --title "..." --body "..."
```

For dependent layers, use `gh stack submit` instead of manual `gh pr create`.

## Title and body

- Title: imperative intent ("Add merge-queue workflow trigger").
- Body: why, what changed, test plan, risk/rollback.
- Link issues with `Fixes #n` / `Refs #n`.
- Fill any repo `PULL_REQUEST_TEMPLATE`.

## Review hygiene

- Keep diffs reviewable: prefer stacks or multiple PRs over a mega-branch.
- Respond to every review thread: fix, or reply with rationale.
- Request reviewers who own the touched areas.

## Merge

| Situation | Action |
|-----------|--------|
| Single PR, checks green | Squash or merge per `context/git.md` |
| Stack | Stack merge bottom-up |
| Merge queue required | Enqueue; do not force direct merge |
| Required check failed | Fix or escalate -- never bypass |

Never `--admin` bypass. Never merge with failed required checks.
