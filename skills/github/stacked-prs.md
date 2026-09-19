# Stacked pull requests

Native GitHub stacks: an ordered chain of PRs in **one repository**. The
bottom PR targets trunk; each higher PR targets the branch below it.
Cross-fork stacks are unsupported.

## When to stack

**Stack when:** the change is too large for one review; later work depends on
unmerged foundations; concerns separate cleanly (schema -> API -> UI -> docs).

**Do not stack when:** every branch could land independently; the diff is
smaller than the cost of explaining the stack; forks are involved.

Prefer **3-5 clear layers** over a dozen microscopic ones.

## Layer design

- Dependencies point **down**: types/schema below consumers.
- One concern per layer.
- Each PR's visible diff is only that layer.

## CLI: `gh stack`

```bash
gh stack init [--base TRUNK] [branches...]
gh stack add [branch] [-Am "msg"]
gh stack push
gh stack submit [--auto] [--open]
gh stack rebase [--continue|--abort]
gh stack sync [--prune]
gh stack merge [<pr>]
```

## Merge semantics

- Merge **bottom-up**. Merging a mid/top PR lands that PR and everything
  below it atomically.
- Use async stack merge API, not legacy merge endpoints.
- **No auto-merge** on stacked PRs. **No admin bypass**.

## Agent checklist

1. Confirm same-repo branches; read `context/git.md` for trunk.
2. `gh stack init` -> commits per layer -> `add` -> `push` -> `submit`.
3. After trunk moves: `gh stack rebase` then `push` / `sync`.
4. Land with stack-aware merge; verify required checks on every layer first.
