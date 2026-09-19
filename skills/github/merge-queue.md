# Merge queue

A merge queue serializes landing on a busy trunk. Enable via a **ruleset**
that requires the merge queue -- not by workflow alone.

## Hard requirements

1. Every required status check must also run on the `merge_group` event.
2. Do not combine merge queue with classic branch-protection `*` wildcards.
3. Tune concurrency to CI capacity.

Minimal workflow shape:

```yaml
on:
  pull_request:
  merge_group:
```

## Stacks + merge queue

Stacks are merge-queue aware. Ejecting one PR removes it and everything above
it in the stack. Use stack-aware merge, not ad-hoc direct merges.

## Operational practice

- Keep required queue checks **small and deterministic**.
- Set a check response timeout.
- Hotfix / emergency merge paths are **human-owned** runbooks.
- Monitor ejection reasons and p95 queue latency.

## Agent checklist

1. List required checks from `context/git.md`.
2. Grep workflows for `merge_group` coverage of each required job.
3. If enabling: update workflows first, then ruleset, then verify with a
   canary PR.
