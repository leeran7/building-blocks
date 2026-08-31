# Learnings Ledger

**Read `## Standing rules` only, then stop.** Topic sections below are optional.
Directory map: `loop/INDEX.md`. Do not open `learnings.jsonl` whole; Grep.

Kernel quality gates (every repo): `skills/closed-loop/gates.md`.
This file is **this product’s** memory. Do not copy it into `closed-loop-agents`.
This product’s stack, git, and trust facts: `context/`.

_Last curated: 2026-08-31T03:00:00Z — retro over climb-recording share SEO
(iteration 1, product-spec → release; skip monitor — no production deploy)._

> The Aug 29 ledger was folded by the dispatcher by hand. `foldLearnings` in
> `orchestrator/src/retro.ts` now implements the three steps
> `learning-loop.md` promises (topic routing, promotion at 2+ agents or
> 2+ iterations, Recently applied trimmed to 20). Subsequent retros should
> go through that function rather than another hand pass. See F-17 in
> `archive/reviews/2026-08-29.md`.

## Standing rules (always apply)

Promoted because they were independently discovered by **two or more** agents in
the same pass — the `learning-loop.md` bar for a permanent guardrail.

- **[all] A quality gate is not a gate until it has been proven to fail.** The
  CI lint step passed on every commit of 29 Aug while linting zero files (`app/`
  has no ESLint config, so `next lint` prints its setup prompt and exits 0).
  Before trusting any gate, feed it a deliberately violating input and confirm it
  goes red. Corollary: never silence a gate to make it pass — excluding
  `src/**/*.test.ts` from `orchestrator/tsconfig.json` left four test files
  typechecked by nothing.
  _(reviewer, frontend, backend, verifier)_

- **[all] Never assert behaviour by grepping source text.** `readFileSync` +
  `toContain` / `not.toMatch` against production source produced three assertions
  that pass while the bug they name is live: an empty-paren literal
  (`not.toContain("fn()")`) that no real call site can ever match, and a negative
  lookahead that exempted the exact dangerous form it existed to forbid. Invoke
  the unit and assert its output. Reject any test whose only failure mode is a
  rename.
  _(backend, verifier, reviewer)_

- **[all] Before testing or hardening a module, confirm it has a non-test
  caller.** `antiCheat.ts` had 8 tests citing four acceptance criteria and zero
  production callers, while `simulation.ts` enforced a divergent rule of its own.
  `categoryUtils.ts` received prototype-pollution hardening while its only
  importer was its own test — a test asserting a taxonomy production now 404s. No
  production caller means the test proves nothing and the AC matrix over-reports:
  wire it up or delete it.
  _(reviewer, security-reviewer, backend, verifier)_

- **[implementer, verifier, docs] A docblock stating an invariant is a comment,
  not a contract, until a test asserts it.** Three load-bearing docblocks
  contradicted their code in one day: `powerups.ts` claimed a "one slot, hoarding
  is impossible" rule production does not implement (and its endless-run balance
  argument rests on that false premise), a route documented a six-value enum it
  now 404s, and `learning-loop.md` promised retro steps `retro.ts` never
  implements. Update the docblock in the same commit as the behaviour.
  _(reviewer, verifier)_

- **[implementer, performance] Never replace an O(1) closed-form position formula
  with a per-index generator without adding a prefix-sum or memo in the same
  change.** Making `floorGapForFloor` per-floor seeded turned `floorHeight` and
  `floorIndexAt` into O(floor) loops and every per-tick geometry query into
  O(floor²) — frame cost that scales with the player's score in an endless
  climber. It showed up as two test suites jumping from sub-250 ms to >3 s. Treat
  a >10× suite runtime jump as a perf regression signal, not noise.
  _(reviewer, frontend, verifier)_

- **[backend, architect, reviewer] Removing a bad default is not the same as
  fixing write-on-read.** The ghost-season fix deleted every `category = "tech"`
  default but left `getOrCreateActiveSeason` on three public read paths, one
  reachable by unauthenticated GET — turning one ghost season into up to 75. When
  a bug is "entity X gets created with the wrong key", grep the whole repo for the
  `getOrCreate` symbol rather than the file named in the report, and confine
  creation to authenticated write paths.
  _(backend, verifier, security-reviewer)_

- **[orchestrator, devops] A memory that version control deletes is not memory.**
  `loop/` was gitignored wholesale, so the ledger `CLAUDE.md` calls "persistent
  cross-agent memory… never deleted between runs" was empty on a fresh VM and no
  agent in this pass could apply a prior lesson. Fixed by switching to `loop/*`
  with negations for the two ledger files — note `loop/` cannot work, because git
  will not re-include a file inside a wholly excluded directory.
  _(reviewer, dispatcher)_

## By topic

### Testing

- 185 source-text assertions across 5 files; **77 of 298 app tests (26%) never
  execute a line of production code**, and no test invokes an API route handler
  though 326 route lines changed. `app/tests/api/tower.test.ts` (16 tests, 51
  assertions) could pass against a completely non-functional API.
- **Never re-implement production logic in a test.** `v2.test.ts`'s local copy of
  `estimateDaysUntilBuried` lacked the AC-23 null cap and used `Math.round` with
  `G0=10` where production uses `Math.floor` with `G0=0.65`; two of its tests now
  assert the inverse of production and pass. Export the function and import it —
  if it is unexportable, that is the bug to fix first.
- **Prove every negative regex guard against a positive fixture** of the string it
  must reject. Where two files guard one invariant at different strengths, delete
  the weaker one; it silently defines the actual guarantee.
- **When a test covers the guarded instance of a branch, add the unguarded ones in
  the same commit.** The only same-type power-up duplicate tests used `time-slow`,
  the one type whose cooldown blocks the path — leaving all four zero-cooldown
  types, and a real double-jump charge exploit, uncovered.
- Model to copy: `app/tests/game/hazard.test.ts` — invariant sweep, hostile-config
  guard, closed-form cross-check, named-constant assertions. 13 tests, 13 ms, every
  one able to fail for a real reason. Contrast `v2.test.ts` running 57 tests in
  7 ms because it touches nothing.

### Security

- **A monotonic or otherwise irreversible write makes its input a hard trust
  boundary.** Client-authoritative simulation + a self-reported score field +
  `Math.max` persistence = a permanently unrecoverable leaderboard. The value must
  be server-derived. If a route comment claims verification happens elsewhere,
  confirm that path exists before merging.
- **Gate a money-granting webhook on the provider's own payment state.** Stripe's
  `checkout.session.completed` fires with `payment_status: "unpaid"` for
  delayed-notification methods, and the enabled set is Dashboard-controlled when
  `payment_method_types` is omitted — so the decision depended on config outside
  the repo.
- **A 4xx from a webhook means the provider never retries**, so returning 400 for
  an unresolvable reference permanently loses a captured payment. A 500 for a
  deterministic condition fails identically on every retry. Dead-letter the event
  and return 200.
- **Reuse the repo's own hardened helper.** A correct constant-time token compare
  existed in `requireAdmin.ts`; the internal-token route hand-rolled `!==` and was
  the only sensitive route with no rate limit.
- **Never derive an outbound URL that carries a secret from a request value.**
  Middleware forwarding `INTERNAL_TOKEN` to `request.nextUrl.origin` is safe only
  while `experimental.trustHostHeader` is unset — one common proxy fix away from
  being an exfiltration primitive.
- **Pattern worth keeping:** replacing permissive defaults with allow-list parsers
  that return `null` (`parsePaidStackSlug`/`parseSeasonSlug`) plus `Object.hasOwn`
  for user-keyed lookups eliminated a whole bug class. Reject, never substitute a
  default.

### Architecture & contracts

- **When a counter goes from global to per-partition, every key that gates writes
  to it must gain the partition.** `views_k` became per-stack but the session-dedup
  and hourly-ceiling keys did not, so a visitor browsing five stacks credits only
  the first — and `views_k` is the sole input to burial and price-per-metre.
- **A partitioned resource cannot keep a single scalar aggregate in its response.**
  Deriving `engine`/`season` from whichever block is rank 1 preserved the response
  *shape* while changing its meaning, so no contract test could catch it.
- **Declare every index the application logic depends on in `schema.prisma`.** A
  P2002 race guard and the rollover concurrency containment both rested on a
  partial unique index that exists only in migration SQL and would be dropped by
  `prisma db push`.
- **Destructive admin endpoints need an idempotency key and a precondition.**
  Season rollover reset `views_k` on every POST with no `ends_at` check and no
  dry-run, and reported a uniqueness conflict as a generic 500.
- Give every `findMany` a `take` and a `select`; replace per-row awaited update
  loops with one conditional `UPDATE`, and read-then-`findIndex` rank derivation
  with an indexed `count`.
- **Enforce uniqueness at every write site for any collection read with
  `.find(x => x.key === k)`.** An append-only `activePowerUps` array produced two
  live entries of one type: duplicate React keys, a stale countdown, and 4–5
  mid-air jumps while the charge counter reported 2.
- Declare exported arrays that encode policy (`REQUIRED_TEAM`,
  `REQUIRED_SEQUENCE`) as `readonly`; parse ISO timestamps with `Date.parse`
  rather than comparing them as strings.
- Declare branch-assigned locals without an initializer so the compiler proves
  every path assigns them; `let x = ""` silently disables definite-assignment
  checking.

### Performance

- Tower geometry measured O(floor) per query, O(N²) per scan: `floorHeight` scans
  cost 30.6/123.2/480.7 ms for 400/800/1600 floors. No timing assertion exists
  anywhere in `app/tests/**`, so a further regression would be invisible. Assert
  algorithmic *shape* (time at floor 4000 under 2.5× time at floor 2000), not a
  wall-clock ceiling.
- **Assigning `canvas.width` resizes and clears the bitmap even when the value is
  unchanged.** Doing it in a state-keyed effect reallocated and zeroed a ~15 MB
  backing store 60 times a second once fullscreen raised `MAX_WIDTH` from 560 to
  2560. Guard the assignment; clamp `devicePixelRatio`.
- **Do not route per-tick simulation state through React state.** Every consumer
  becomes a 60 fps component: a `filter`/`map`/`sort`/`join` `useMemo` per frame,
  an inline gradient string regenerated per frame forcing a style recalc, and a
  canvas drawn in `useEffect` (after paint) costing a frame of latency. Keep the
  authoritative state in a ref, draw from the rAF callback, publish to React only
  at UI-relevant granularity.
- **When changing a cache key from low to unbounded cardinality, add eviction in
  the same change.** A module-level `Map` was safe keyed by a stable per-category
  seed; a fresh `newRunSeed()` per run made it an unbounded leak.

### Spec quality

- **Reset every previous-value ref in a feedback hook when the match changes.**
  Refs surviving a game restart fired a phantom "X ended" cue at the top of a
  fresh run and silently swallowed a real pickup whose tick index collided with
  the previous run's.
- **A global game key listener with unconditional `preventDefault` breaks the
  page around it.** Space stopped activating every focused button (including a
  mute toggle added the same day) and the arrow keys stopped scrolling. Scope such
  listeners to the phases that consume input and skip `preventDefault` when the
  target is a control.
- **Reserve low-contrast tokens for decorative glyphs.** `text-muted` on void is
  4.11:1 and was used for 10–11 px body copy, even though a comment in the same
  directory already rejected that colour for that reason. Give every
  touch-reachable control a 44×44 box before fixing a container height. Append a
  monotonic counter to `aria-live` text so a repeated identical message still
  announces.
- **Enumerate every capability shipped in the same change set when widening a
  validator.** An allowance added for `rapid-climb` missed the two jump power-ups
  in the same PR, so a legitimate super-jump produces 11 consecutive illegal ticks
  against a threshold of 5.
- Unlock Web Audio from a real gesture handler (WebKit requires `resume()` inside
  one) and wrap every node call in `try/catch` — an `InvalidStateError` escaping a
  React effect unmounts the game.

### Build / CI

- The lint gate passed unconditionally (see standing rules). Require a committed
  config and `--max-warnings=0`.
- Test files excluded from `tsconfig` and run through a type-stripping runner are
  typechecked by nothing. Use a second `tsconfig.test.json` rather than an
  `exclude`.
- **Do not supply production-grade secrets to a `pull_request`-triggered job.**
  Fork PRs are safe, but a same-repo branch PR exfiltrates them with a one-line
  test change, and install lifecycle scripts run in the same scope. Add
  `permissions: contents: read` and SHA-pin third-party actions.
- Pick one package manager per package: `orchestrator/` has only a `yarn.lock` but
  `yarn loop` dispatches to `pnpm`, resolving a different tree than CI.
- **Verify Next.js static-vs-dynamic from the `next build` route table**, not by
  reasoning. A server-component page awaiting a DB read with no `dynamic`/
  `revalidate` export is prerendered and frozen forever, and a `.catch(() => [])`
  fallback bakes in empty data while the build still exits 0.
- `pnpm audit` in `app/`: 61 findings (2 critical, 22 high). `next` pinned exactly
  at `14.0.4` accounts for the critical (middleware auth bypass) and 15 highs. An
  exact pin means routine updates never move it — add an audit gate.

### Orchestration

- `retro.ts` implements none of the three documented folding steps; `retro.test.ts`
  asserts none of them. Either implement or correct the docs — the system claims
  to get stricter over time and does not.
- Read-only agents cannot write the ledger. When dispatching them **inline**, the
  dispatcher must persist their `learnings` arrays, or the learning loop silently
  loses the finding. Five agents' arrays were normalised and appended in this pass.
- Agents emitted `learnings` in **two different schemas** — the documented
  `ts`/`kind`/`insight`/`action`/`confidence` shape and an undocumented
  `id`/`type`/`lesson` shape. The dispatcher had to normalise. Consider validating
  handoff `learnings` against a schema at ingestion.
- Verified working as documented: `clampNextStage` ignores skips outside
  `OPTIONAL_AFTER`, `teamMissing` blocks completion on an undispatched required
  member, and `withCriticalRevision` converts a `success` handoff carrying
  critical findings into `needs_revision`. `team.test.ts` and `stages.test.ts` are
  the strongest tests added that day.

## Open questions (unresolved, need a decision)

- **[security-reviewer → product-spec, architect] Is the free leaderboard a trust
  boundary?** `climb/result/route.ts` argues its self-reported `peakY` is
  acceptable because it "never pays out", but the leaderboard renders on the
  landing page beside the paid stacks, and the ranked re-simulation path its
  docstring defers to does not exist. If it is displayed next to paid stacks,
  spec an AC requiring server-derived peaks for it too.
- **[reviewer, verifier → architect] One slot or stacking for power-ups?**
  `powerups.ts:18-19` documents one slot; production stacks all five types and
  `powerups.test.ts:236` asserts stacking is correct. The endless-run balance
  argument depends on the answer, and so does the fix for the duplicate-entry bug.
- **[backend → architect] Is `/api/tower` (unscoped) still a supported contract?**
  Its `season`/`engine`/`cost_of_rank1_usd` fields are meaningless once stacks are
  partitioned. Scope the endpoint or drop the fields.
- **[dispatcher → user] Which of the proposed doc updates in
  `archive/reviews/2026-08-29.md` are approved?** The `.gitignore` change is applied
  in this branch; the rest await approval per the standing rule.

## Recently applied (last 20)

- 2026-08-31 — Climb-recording share SEO: canonical `/r/{cuid}`, standalone
  share payload (X 280 / TikTok 2200 / YouTube title 100 / description 5000,
  never slice), unique OG/Twitter cards, GET `/api/share/recording/{id}` for
  the marketing agent, robots/sitemap with zero `/r/` rows, one `isBot` list
  including tiktok/bytespider/bytedance. PR #50. Applied.
- 2026-08-31 — Share JSON is an allow-list DTO (no Prisma spread). Canonical
  URLs take `resolveBaseUrl()`, never request Host. F-1 peakY remains
  untrusted display. Applied.
- 2026-08-31 — Verifier proved AC-1–AC-40 by importing production units
  (`pnpm test` 58 files / 630 passed). Do not grep `route.tsx` for palette
  hexes. Applied.
- 2026-08-29 — `.gitignore` switched from `loop/` to `loop/*` plus negations so the
  learnings ledger is version-controlled (F-16). Applied.
- 2026-08-29 — 52 learnings from `reviewer`, `security-reviewer`, `frontend`,
  `backend` and `verifier` normalised to the documented schema and appended to
  `learnings.jsonl` by the dispatcher. Applied.
