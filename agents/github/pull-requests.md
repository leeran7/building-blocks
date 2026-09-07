# Pull request practices

## Create

```bash
# Single PR (no stack)
git push -u origin HEAD
gh pr create --base <trunk> --title "..." --body "$(cat <<'EOF'
## Summary
…

## Test plan
- [ ] …

## Risk
…
EOF
)"

# Optional: draft until ready
gh pr create --draft ...
gh pr ready
```

For dependent layers, use `gh stack submit` (see `stacked-prs.md`) instead of
manual `gh pr create` with hand-set bases — bases and the Stack object stay
consistent.

## Title and body

- Title: imperative intent (“Add merge-queue workflow trigger”), not noise.
- Body: why, what changed at a high level, test plan, risk/rollback.
- Link issues with `Fixes #n` / `Refs #n` when tracking work in Issues.
- Fill any repo `PULL_REQUEST_TEMPLATE` / `.github/PULL_REQUEST_TEMPLATE*`.

## Review hygiene

- Keep the diff reviewable: prefer stack layers or multiple PRs over a
  kitchen-sink branch.
- Respond to every review thread: fix, or reply with rationale. Do not leave
  conversations unresolved when requesting merge.
- CODEOWNERS approvals count per path; mid-stack PRs still need trunk’s
  CODEOWNERS rules when stacks are used.
- Prefer requesting reviewers who own the touched areas; avoid drive-by
  rubber-stamps on sensitive paths (auth, billing, rulesets).

## Merge

| Situation | Action |
|-----------|--------|
| Single PR, checks green, approvals met | Squash or merge per repo convention in `context/git.md` |
| Stack | Stack merge bottom-up / whole contiguous prefix — see `stacked-prs.md` |
| Merge queue required | Enqueue; do not force direct merge |
| Required check missing or failed | Fix or escalate — never bypass |

```bash
gh pr checks
gh pr view --json mergeable,mergeStateStatus,statusCheckRollup,reviewDecision
gh pr merge --squash   # or --merge / --rebase — honor repo settings
```

Never `--admin` bypass for convenience. Never merge with failed or pending
**required** checks. A workflow that merely *runs* on `pull_request` is not
a gate until a ruleset requires its check name.

## After merge

- Delete the head branch when the repo allows (`gh pr merge --delete-branch`
  or UI).
- For stacks: `gh stack sync --prune` to drop merged local branches and
  retarget remaining layers.
- Confirm deploy/release hooks if `context/git.md` or release docs require
  them — hand off to release/devops rather than inventing a pipeline.
