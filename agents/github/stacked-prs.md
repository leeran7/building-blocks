# Stacked pull requests (public preview, 2026)

Native GitHub stacks: an ordered chain of PRs in **one repository**. The
bottom PR targets trunk (usually the default branch); each higher PR targets
the branch below it. Cross-fork stacks and GitHub Desktop are unsupported.

```
feat/ui        → PR #3 (base: feat/api)   ← top
feat/api       → PR #2 (base: feat/types)
feat/types     → PR #1 (base: main)       ← bottom
main (trunk)
```

## When to stack

**Stack when:** the change is too large for one careful review; later work
depends on unmerged foundations; AI/agent throughput would otherwise produce
a mega-PR; concerns separate cleanly (schema → API → UI → docs).

**Do not stack when:** every branch could land independently on trunk; the
diff is smaller than the cost of explaining the stack; the team cannot
rebase; forks are involved; the feature cannot be split into coherent layers.

Prefer **3–5 clear layers** over a dozen microscopic ones. Every layer costs
CI, rebase, and review state.

## Layer design

- Dependencies point **down**: types/schema below consumers; API below UI.
- One concern per layer. New layer when concern, dependency, or review size
  changes.
- Each PR’s visible diff is only that layer (base = parent branch).
- Branch protection, required checks, and CODEOWNERS are evaluated as if
  every PR targeted the **stack trunk**, not the mid-stack base.

## CLI: `gh stack` (`github/gh-stack`)

```bash
gh extension install github/gh-stack
# Optional agent skill from the extension repo:
# gh skill install github/gh-stack

gh stack init [--base TRUNK] [branches...]
gh stack add [branch] [-Am "msg"]
gh stack push
gh stack submit [--auto] [--open]
gh stack view | up | down | top | bottom
gh stack rebase [--continue|--abort] [--downstack|--upstack|--no-trunk]
gh stack sync [--prune]
gh stack modify          # reorder / fold / drop (CLI only; no web reorder)
gh stack checkout <n|pr|url|branch>
gh stack link <bottom> ... <top>   # stack existing PRs without local tracking
gh stack merge [<pr>]              # prefer over legacy merge for stacks
```

Local metadata: `.git/gh-stack` (not committed). Push uses
`--force-with-lease` per branch (not one atomic multi-ref push).

## Merge semantics

- Merge **bottom-up**. Merging a mid/top PR lands that PR **and everything
  below it** as one atomic operation.
- Remaining upper PRs stay open and are automatically rebased/retargeted.
- Methods: merge commit, squash, rebase. Merge-queue aware.
- **No auto-merge** on stacked PRs. **No admin bypass** of stack merge
  requirements.
- API: use async stack merge (`PUT .../merge-async` / stack merge action).
  Legacy synchronous PR merge endpoints cannot merge a stack.

## CI on stacks

Workflows that fire on `pull_request` → trunk also run for **every** stack
layer. Optimize expensive jobs with `github.event.pull_request.stack` when
present:

- Lowest unmerged: `stack.base.ref == base.ref`
- Top of stack: `stack.position == stack.size`
- Original bottom: `stack.position == 1`

Webhook/REST/GraphQL expose `stack` membership and position for automation.

## Agent checklist

1. Confirm same-repo branches; read `context/git.md` for trunk.
2. `gh stack init` → commits per layer → `add` → `push` → `submit`.
3. After trunk moves or lower feedback: `gh stack rebase` then `push` /
   `sync` — do not hand-rebase one branch and orphan the rest.
4. Land with stack-aware merge; verify required checks on every layer first.
