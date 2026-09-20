# Open Questions

Questions that need a human decision before agents can proceed.
Resolved questions are removed — the answer lives in the target file.

- **[security-reviewer -> future work, filed 2026-09-20] `/tournaments` has the
  same prerendered/ungeo-gated defect this change fixed on `/duel`.**
  `/tournaments` is still in `.next/prerender-manifest.json`'s static route
  list, and `TournamentList.tsx` renders the cash-prize entry-fee picker +
  "Join queue" with no geo gate at all (not even a client probe).
  `app/app/api/tournaments/queue/route.ts` has no `assertPaidDuelAllowed` call,
  unlike its checkout/register siblings. Currently harmless only because both
  handlers unconditionally `return comingSoon()` (503). Whoever removes that
  early return to launch tournaments must: (a) add `assertPaidDuelAllowed` /
  `guardPaidDuelRequest` to `/api/tournaments/queue`, and (b) give
  `/tournaments` the same treatment this change gave `/duel` —
  `resolveRankedEligibility(await headers())` + `force-dynamic` + a required
  `initialGeoAllowed` prop on `TournamentList`. Not blocking today; remove
  this entry once tournaments launch work picks it up.

- **[security-reviewer -> software-engineer] Is the free leaderboard a
  trust boundary?** `climb/result/route.ts` self-reports `peakY` which is
  acceptable "because it never pays out", but the ranked re-simulation path
  does not exist. Paid Stacks removed 2026-09-10; question still open for
  the free leaderboard itself.

- **[reviewer, verifier -> software-engineer] One slot or stacking for power-ups?**
  `powerups.ts:18-19` documents one slot; production stacks all five types
  and `powerups.test.ts:236` asserts stacking is correct. The endless-run
  balance argument and the duplicate-entry bug fix depend on the answer.
