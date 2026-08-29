# Kernel quality gates

Product-agnostic rules. They apply in every repo that vendors this pack.
They were promoted from standing rules that multiple agents independently
found (see `loop/learnings.md` in the originating repo, Aug 29 2026).

Do **not** copy these into every agent file. Read this file. Role-specific
hard rules stay on the role. Product-specific lessons stay in that repo's
ledger.

## Testing

1. **A quality gate is not a gate until it has been proven to fail.** Before
   trusting lint, typecheck, tests, or audit, feed a deliberately violating
   input and confirm the command goes red. Never silence a gate to make it
   pass (for example by excluding the files it should check). Profile
   `context/gates.json` `gates[].proveFail` exists for this.
2. **Never assert behaviour by grepping source text.** `readFileSync` +
   `toContain` / `not.toMatch` against production source passes while the
   bug is live (empty-paren literals, inverted negative lookaheads). Invoke
   the unit and assert its output. Reject any test whose only failure mode
   is a rename.
3. **Do not re-implement production logic in a test.** Export the function
   and import it. If it is unexportable, that is the bug to fix first. A
   diverged copy will assert the inverse of production and still pass.
4. **Before testing or hardening a module, confirm it has a non-test
   caller.** Tests on a file that only the test imports prove nothing and
   make the AC matrix lie. Wire it up or delete it. If two modules enforce
   the same rule, they must not diverge — one implementation.
5. **A docblock stating an invariant is a comment, not a contract, until a
   test asserts it.** Update the docblock in the same commit as the
   behaviour.
6. **Prove every negative guard against a positive fixture** of the string
   or input it must reject. When two guards cover one invariant at
   different strengths, delete the weaker one.
7. **When a test covers the guarded instance of a branch, add the unguarded
   ones in the same commit.** Do not test only the representative that
   already has a cooldown, feature flag, or early-return.

## Security and contracts

8. **Reject, never substitute a default.** Allow-list parsers return `null`;
   user-keyed lookups use `Object.hasOwn` (or equivalent). Permissive
   defaults plus write-on-read create ghost records.
9. **Removing a bad default is not the same as fixing write-on-read.** When
   the bug is "entity X is created with the wrong key", grep every caller
   of the `getOrCreate` / upsert symbol — not only the file named in the
   report — and confine creation to authenticated write paths.
10. **A monotonic or otherwise irreversible write makes its input a hard
    trust boundary.** The value must be server-derived. If a comment claims
    verification happens elsewhere, confirm that path exists before merge.
11. **Reuse the repo's own hardened helper.** Do not hand-roll `!==` for
    secrets when a constant-time compare already exists. New
    token-authenticated routes get the same rate limiter as the others.
12. **Never derive an outbound URL that carries a secret from a request
    value** (host header, origin, redirects).
13. **Ack webhooks so the provider retries only on real failures.** A 4xx
    for an unresolvable reference permanently loses a captured payment on
    providers that do not retry 4xx. Dead-letter and return 2xx when the
    event cannot be applied but must not be replay-pounded. Gate credits on
    the provider's own payment/success state, not merely on event type.
14. **Declare every index application logic depends on in the schema** the
    ORM will not drop. Indexes that exist only in a one-off SQL file vanish
    on `db push`.

## Architecture and performance

15. **When a counter is partitioned, every key that gates writes to it must
    gain the partition** (dedup, rate limit, hourly ceiling, uniqueness).
16. **A partitioned resource cannot keep a single scalar aggregate** that
    used to mean "the whole world" without changing the contract.
17. **Enforce uniqueness at every write site** for any collection later
    read with `.find(x => x.key === k)`.
18. **Never replace an O(1) closed-form with a per-index scan** without a
    prefix-sum or memo in the same change. Treat a >10× suite-runtime jump
    as a perf regression. Assert algorithmic *shape* (time at 2N vs N),
    not only a wall-clock ceiling.
19. **When a cache key goes from low to unbounded cardinality, add eviction
    in the same change.**

## Memory, CI, and the loop

20. **A memory that version control deletes is not memory.** Ignore
    `loop/*` and re-include the ledger files with negations. A directory
    ignore of `loop/` cannot be re-included.
21. **Do not supply production secrets to a `pull_request`-triggered job.**
    Same-repo branch PRs plus install lifecycle scripts are an exfil path.
    `permissions: contents: read`; SHA-pin third-party actions.
22. **Handoff `learnings` must match the canonical schema.** The dispatcher
    normalises a small set of aliases (`lesson`→`insight`, `type`→`kind`)
    and drops entries that still lack `insight` + `action`. Do not invent
    a third shape.
23. **Read-only agents cannot write the ledger.** Inline dispatchers persist
    their `learnings` arrays or the loop silently loses the finding.

## Promotion into this file

A repo standing rule moves here only when it is product-agnostic and was
found by two or more agents with `forAgents: ["all"]`, or independently in
two consuming repos. Land it in a pack change. Leave product facts in that
repo's `loop/learnings.md`.
