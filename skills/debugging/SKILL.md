---
name: debugging
description: >-
  Root-cause investigation. Systematic debugging for test failures, CI errors,
  runtime crashes, and flakes when the cause is unclear. Use when a failure
  resists a quick fix.
---

# Debugging Skill

Observe, hypothesize, test, conclude. Diagnose; do not spray fixes.

## Method

1. **Capture** the full error: originating file:line, stack trace, environment,
   exact reproduction steps.
2. **Narrow** with `git log` / bisect / diff the suspect area. Flakes are
   timing, ordering, or shared state until proven otherwise.
3. **Rank hypotheses** by "smallest change that yields this exact error."
   Test the most likely first.
4. **Minimal repro.** Inspect runtime values; do not assume them. Add a
   targeted assertion or log — not `console.log` everywhere.
5. **Keep asking why** until the fix at that layer makes the symptom
   impossible. A surface patch that silences the error is not a fix.
6. **Verify** the fix by reproducing the original failure path and confirming
   it now passes.

## Common traps

| Symptom | Likely root cause |
|---------|-------------------|
| Test passes alone, fails in suite | Shared state or import side-effect |
| CI red, local green | Environment difference (Node version, env var, timezone) |
| Flaky ~10% of runs | Race condition, uncontrolled timer, network dependency |
| Error in code the diff didn't touch | Transitive type change, missing migration, stale cache |

## Don't

- Patch production without understanding the cause
- Weaken tests or CI to hide the failure
- Report "might be X" without evidence
- Add `try/catch` around the symptom instead of fixing the cause
