# Merge queue

A merge queue serializes landing on a busy trunk: PRs enqueue, GitHub builds
speculative merge groups, and only green groups land. Enable via a **ruleset**
(or branch protection) that requires the merge queue — not by workflow alone.

## Hard requirements

1. Every **required** status check must also run on the `merge_group` event.
   If a check only listens to `pull_request` / `push`, the queue stalls with
   missing checks.
2. Do not combine merge queue with classic branch-protection patterns that use
   `*` wildcards in the branch name (unsupported).
3. Tune concurrency to CI capacity (`max_entries_to_build`, group size,
   timeouts) — optimism creates ejection storms.

Minimal workflow shape:

```yaml
on:
  pull_request:
  merge_group:
```

Use the same job names the ruleset requires so both PR and queue report the
same contexts.

## Stacks + merge queue

Stacks are merge-queue aware (rolling out with stacked PRs). Queued stack
entries keep order; ejecting one PR removes it and everything above it in the
stack. Queue groups may exceed max size by a buffer (~50%) to keep a stack
together; oversized stacks split across consecutive groups.

When merging stacks into a queued trunk, use stack-aware merge /
`merge_action: merge_queue` (or `default`) — not ad-hoc direct merges that
fight the queue.

## Operational practice

- Keep required queue checks **small and deterministic** (lint, unit,
  contract smoke, policy). Put long suites on `pull_request` only if they are
  not required for merge — or accept the queue cost.
- Set a check response timeout so a silent job cannot wedge the queue.
- Hotfix / emergency merge paths are **human-owned** org runbooks — agents
  must not disable rulesets, add bypass actors, or document “temporarily turn
  the queue off” as a normal step.
- Monitor ejection reasons and p95 queue latency after enabling.

## Agent checklist

1. List required checks from `context/git.md`.
2. Grep workflows for `merge_group` coverage of each required job.
3. If enabling a queue: update workflows first, then ruleset, then verify with
   a canary PR — never flip the ruleset while checks cannot report.
