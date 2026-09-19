# Open Questions

Questions that need a human decision before agents can proceed.
Resolved questions are removed — the answer lives in the target file.

- **[security-reviewer -> product-spec, architect] Is the free leaderboard a
  trust boundary?** `climb/result/route.ts` self-reports `peakY` which is
  acceptable "because it never pays out", but the ranked re-simulation path
  does not exist. Paid Stacks removed 2026-09-10; question still open for
  the free leaderboard itself.

- **[reviewer, verifier -> architect] One slot or stacking for power-ups?**
  `powerups.ts:18-19` documents one slot; production stacks all five types
  and `powerups.test.ts:236` asserts stacking is correct. The endless-run
  balance argument and the duplicate-entry bug fix depend on the answer.
