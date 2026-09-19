---
name: testing-strategy
description: >-
  When to unit vs integration vs e2e test. Coverage strategy, test boundaries,
  mock policy, and fixture design. Use when deciding what to test, how to
  structure test suites, or reviewing test quality.
---

# Testing Strategy Skill

Tests prove behavior, not coverage percentages. A 90% coverage number that
tests implementation details is worse than 60% that tests contracts.

## Test pyramid

| Layer | What it proves | Speed | When to use |
|-------|---------------|-------|-------------|
| Unit | A function returns the right output for given input | Fast | Pure logic, transforms, validators, utilities |
| Integration | Components work together through real boundaries | Medium | Database queries, API routes, service interactions |
| E2E | A user flow works from entry to completion | Slow | Critical paths: sign up, purchase, core workflow |

More units than integrations, more integrations than e2e. Invert this and
the suite becomes slow, flaky, and expensive.

## What to test

- **Every public function** that another module imports.
- **Every API endpoint** with valid input, invalid input, and auth failure.
- **Every state machine transition** — not just happy path, but invalid
  transitions that must be rejected.
- **Edge cases**: empty input, null, boundary values, maximum lengths.
- **Error paths**: what happens when the dependency fails?

## What not to test

- Private helpers that only the module uses (test through the public API).
- Framework glue (router config, middleware wiring) — e2e covers this.
- Third-party library behavior (trust it or vendor-test it, don't re-test).
- Getters, setters, and trivial wrappers with no logic.

## Mock policy

- **Mock at the boundary**, not in the middle. Mock the HTTP client, not the
  service that calls it.
- **Never mock the thing you're testing.** If you mock it, you're not testing it.
- **Prefer fakes over mocks** for complex dependencies (in-memory database,
  fake clock, stub filesystem).
- **One mock per test.** If a test needs 5 mocks, the unit under test does too
  much.

## Fixture design

- Fixtures represent **realistic data**, not minimal scaffolding.
- Use factory functions (`createUser({ role: "admin" })`) over raw objects.
- Share fixtures across tests via a `fixtures/` or `__fixtures__/` directory.
- Never hardcode IDs, timestamps, or secrets in fixtures.

## Test quality checks

A test is only valuable if it can fail for the right reason:

1. **Does it fail when the behavior breaks?** Delete the implementation line
   and confirm the test goes red.
2. **Does it pass for the right reason?** A test that passes because it mocks
   the answer proves nothing.
3. **Is it deterministic?** Run it 10 times. If it flakes, fix the flake
   before merging.
4. **Does it test behavior, not implementation?** Renaming an internal variable
   should not break any test.

## Don't

- Assert by grepping source text — invoke the unit and assert its output
- Re-implement production logic in a test (import the function instead)
- Write tests for a file that has no non-test caller
- Use `skip` or `todo` as a permanent state — they rot
- Test the mock instead of the system
