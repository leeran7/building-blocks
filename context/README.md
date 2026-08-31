# Repo context

This folder is **this repository’s** facts. Role files in `agents/` stay generic.

Do **not** read every file. Start with `profile.json`. Open others only when the table says so.

| File | Purpose | Read when |
|------|---------|-----------|
| `profile.json` | name, stack, package managers, paths | every product task |
| `gates.json` | CI commands + `proveFail` | tests, CI, verifier, integrator |
| `trust.md` | irreversible writes, money, secrets | backend, security, payments, scores |
| `git.md` | remote, default branch, required checks | PRs, integrator, release |
| `conventions.md` | how to match this tree | writing code |
| `profile.json` `paths.design` | live tokens | UI / design-ux / frontend |
| `loop/learnings.md` | Standing rules only | after RULES.md; stop at `## By topic` |

Kernel: `INDEX.md` → `RULES.md`. Kernel gates: `skills/closed-loop/gates.md` (not this folder’s `gates.json`).

When adding a fact that is true only here, put it in **this folder** (or the ledger), not in `agents/*.md`.
