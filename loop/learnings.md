# Learnings

**building-blocks** product memory. Kernel guardrails live in
`skills/closed-loop/gates.md`; this repo's stack/git/trust facts in `context/`.
Keep this file short — Standing rules are durable, Notes are recent one-liners.
Prune aggressively.

## Standing rules (always apply)

- [all] Prove a gate fails before trusting it; never silence one to go green (mirrors gates.md 1).
- [all] Never assert behaviour by grepping source — invoke the unit and assert output (gates.md 2).
- [all] A module with no non-test caller proves nothing; wire it up or delete it (gates.md 4).
- [all] A docblock is a comment until a test asserts it; update both in the same commit (gates.md 5).
- [implementer] Reject, never substitute a default; allow-list parsers return null, user-keyed lookups use `Object.hasOwn` (gates.md 8).
- [implementer] An irreversible/monotonic write makes its input a hard trust boundary — the value must be server-derived (gates.md 10).
- [implementer] Don't replace an O(1) closed-form with a per-index scan without a prefix-sum/memo in the same change (gates.md 18).

## Notes (recent — newest first)

- [implementer] Assigning `canvas.width` resizes+clears the bitmap even if unchanged → guard the assignment; clamp devicePixelRatio.
- [frontend] Don't route per-tick sim state through React state (60fps recalcs) → keep authoritative state in a ref, draw from the rAF callback, publish to React only at UI granularity.
- [implementer] Enforce uniqueness at every write site for any array read with `.find(x=>x.key===k)` → append-only `activePowerUps` produced duplicate live entries and phantom charges.
- [implementer] When a counter goes global→per-partition, every gating key (dedup, hourly ceiling) must gain the partition → `views_k` broke crediting across stacks.
- [implementer] Declare every index app logic depends on in `schema.prisma` → a partial unique index living only in migration SQL is dropped by `prisma db push`.
- [implementer] Add cache eviction in the same change a key goes low→unbounded cardinality → a per-run seed turned a module `Map` into a leak.
- [frontend] Scope global key listeners to input phases; skip `preventDefault` on controls → an unconditional handler broke buttons and page scroll.
- [frontend] Unlock Web Audio from a real gesture handler (`resume()` inside it) and wrap node calls in try/catch → an escaped InvalidStateError unmounts the game.
- [frontend] Reserve low-contrast tokens for decorative glyphs; give touch controls a 44×44 box; append a counter to `aria-live` so repeats announce.
- [implementer] Gate money-granting webhooks on the provider's own payment state; a 4xx makes the provider never retry (dead-letter and return 200) (gates.md 13).
- [architect] QUESTION: is the free leaderboard a trust boundary? It renders beside paid stacks but accepts self-reported `peakY` — decide before adding ranked features.
- [architect] QUESTION: power-ups — one slot or stacking? Docs say one slot; production stacks all five. Resolve; the duplicate-entry fix depends on it.
