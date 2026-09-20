# Open Questions

Questions that need a human decision before agents can proceed.
Resolved questions are removed — the answer lives in the target file.

- **[security-reviewer -> future work, filed 2026-09-20, SEC-8] `/tournaments/[id]`
  has the same defect class SEC-4 just fixed on `/tournaments`, one level deeper.**
  `TournamentDetail.tsx` (rendered by `app/app/tournaments/[id]/page.tsx`) shows an
  "Enter tournament — $X" button that POSTs to the real-money Stripe entry-fee
  checkout with no geo awareness at all: no `resolveRankedEligibility`, no
  `force-dynamic`, no `initialGeoAllowed`/`useRankedEligibility` on `TournamentDetail`.
  Not reachable today for three independent reasons: `GET /api/tournaments/[id]`
  unconditionally 503s so `tournament` stays null and the button never mounts; the
  button is also gated on `isOpen`; and `POST /api/tournaments/[id]/checkout`
  already carries `assertPaidDuelAllowed` server-side, so no money could move even
  if reached. The page is also not statically prerendered, so no build-time HTML
  bakes in a paid CTA for a blocked region. Whoever removes the `comingSoon()`
  early returns to launch tournaments must, in the same change as SEC-4's original
  checklist item: make `app/app/tournaments/[id]/page.tsx` async, call
  `resolveRankedEligibility(await headers())`, add `export const dynamic =
  "force-dynamic"`, and give `TournamentDetail` a required `initialGeoAllowed:
  boolean` prop gating the `isOpen`/Enter-button block the same way `TournamentList`
  now gates its tier picker. Not blocking today; remove this entry once tournaments
  launch work picks it up.

- **[security-reviewer -> software-engineer] Is the free leaderboard a
  trust boundary?** `climb/result/route.ts` self-reports `peakY` which is
  acceptable "because it never pays out", but the ranked re-simulation path
  does not exist. Paid Stacks removed 2026-09-10; question still open for
  the free leaderboard itself.

- **[reviewer, verifier -> software-engineer] One slot or stacking for power-ups?**
  `powerups.ts:18-19` documents one slot; production stacks all five types
  and `powerups.test.ts:236` asserts stacking is correct. The endless-run
  balance argument and the duplicate-entry bug fix depend on the answer.
