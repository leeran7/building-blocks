# Building Blocks — Closed Loop Agents

Multi-agent system for building apps autonomously. Works in **Cursor** and **Claude Code**.

## Quick start (Claude Code)

```
/closed-loop
```

Or invoke the orchestrator directly:

```
Use the orchestrator agent to run the closed loop: Build a todo app with auth
```

You can also @-mention any agent: `@implementer`, `@reviewer`, `@verifier`, etc.

## Agent locations

| Platform | Agents | Skills |
|----------|--------|--------|
| Claude Code | `.claude/agents/` | `.claude/skills/closed-loop/` (`/closed-loop`) |
| Cursor | `.cursor/agents/` | `.cursor/skills/closed-loop/` |
| Source of truth | `agents/` | `skills/closed-loop/` |

Edit files in `agents/` or `skills/`, then run `yarn sync` to regenerate platform-specific copies.

## Loop runtime

Shared runtime artifacts live in `loop/` (not platform-specific):

- `loop/state.json` — current stage and iteration
- `loop/handoffs/` — JSON handoffs between agents
- `loop/spec.md`, `loop/architecture.md`, etc. — stage outputs
- `loop/learnings.md` + `loop/learnings.jsonl` — **persistent cross-agent memory.**
  Every agent reads it before working and records findings after; the orchestrator
  runs a retro each iteration that folds learnings in and promotes recurring ones to
  standing rules. Never deleted between runs. See `skills/closed-loop/learning-loop.md`.

## ⚠️ Standing rule — agent review is MANDATORY

**Agent review is MANDATORY for all code changes. NO exceptions.**

*Exception: Production hotfixes may push first then review post-facto, but must complete all review steps and address findings within 24 hours.*

### Change classification and required review:

**Substantial changes** (new features, refactors, security-sensitive code, >50 LOC, >3 files):
- `@reviewer` + `@security-reviewer` + domain agents (`@frontend`, `@backend`, `@data`, etc.)

**Minor changes** (small bug fixes, single function changes, <50 LOC):
- `@reviewer` + `@security-reviewer`

**Trivial changes** (typo fixes in comments, README formatting, no code):
- No review required (but consider `@reviewer` for accuracy)

**Documentation with code examples** (runbooks with config/scripts):
- `@reviewer` + `@security-reviewer` (code examples can introduce vulnerabilities)

### Mandatory workflow for substantial and minor changes:

1. **Read learnings** — BEFORE implementing, read `loop/learnings.md` (your section + `all`) and `loop/learnings.jsonl` (grep for your agent). Apply all high-confidence lessons.
2. **Implementation** — implement directly OR use agents (`@implementer`, `@frontend`, `@backend`, etc.)
3. **Review** — dispatch required review agents (in parallel per classification above)
4. **Fix** — address all **critical** findings (warnings/info: document or defer with justification)
5. **Re-verify** — re-run reviewers after fixes until `status: success` (no critical findings)
6. **Update docs** — see "PR checklist" section below

**Critical findings are blocking:** If `@security-reviewer` or `@reviewer` return `status: needs_revision`, you MUST fix all critical findings and re-run until `status: success`. If you believe a finding is a false positive, document why and get explicit user approval.

**Persist their output.** Read-only reviewers can't write to `loop/` themselves —
they return findings + a `learnings` array as text. When you dispatch them
_inline_ (not via the orchestrator), **you** are the dispatcher: append their
learnings to `loop/learnings.jsonl` and, for a substantial change, drop their
handoff JSON in `loop/handoffs/`. Otherwise the learning loop silently loses the
finding (see `skills/closed-loop/learning-loop.md`).

## ⚠️ Standing rule — continuous learning & document updates

Agents **must** continuously learn and update their definitions and skills based on every interaction:

**Before every push to main:**
1. **Record learnings** — append your learnings to `loop/learnings.jsonl` (one line per learning)
2. **Persist read-only agent learnings** — if you dispatched read-only agents (`@reviewer`, `@security-reviewer`, etc.) inline, append their `learnings` arrays to `loop/learnings.jsonl` (they cannot write it themselves)
3. **Check if learnings require doc updates** to:
   - Agent definitions (`agents/*.md`)
   - Skills (`skills/closed-loop/*.md`)
   - This file (`CLAUDE.md`)
   - Documentation (`docs/*.md`)
4. **Propose changes to the user** with:
   - What needs to be updated (file + section)
   - Why (what learning triggered it) — **redact specific vulnerability details** (say "injection vulnerability" not "SQL injection in /api/search endpoint")
   - Proposed change (addition or removal)
5. **After user approval** — make the updates and run `yarn sync`
6. **Commit doc updates** in the same commit as the code changes

**Document updates are not optional** — if an agent discovers a pattern, pitfall, or
lesson that should be codified, it **must** propose updating the relevant docs.
The system gets smarter over time by writing down what it learns.

**Note:** This workflow assumes trunk-based development pushing directly to `main` per the git standing rule.

## ⚠️ Standing rule — git & push workflow

- **Remote:** push only to the **`building-blocks`** remote
  (`git@github.com:leeran7/building-blocks.git`). **Never** push to `origin` — it
  points at a different repo (`closed-loop-agents`).
- **Branch:** this project is trunk-based — commit and push straight to **`main`**.
  Do **not** open feature branches or PRs by default. If work happened on a branch,
  fast-forward main first (`git checkout main && git merge --ff-only <branch>`),
  then `git push building-blocks main`.
- Still **review before pushing** (standing rule above): review-then-push, never
  push-then-review.

## Push checklist (mandatory before every push to main)

Before pushing **any** substantial or minor change, complete this checklist:

- [ ] **Code implemented** — by agents or inline
- [ ] **Tests pass** — `@verifier` or manual test run (run before review to avoid wasted cycles)
- [ ] **`@reviewer` passed** — returned `status: success`, all critical findings fixed
- [ ] **`@security-reviewer` passed** — returned `status: success`, all critical findings fixed, warnings/info documented or deferred with justification
- [ ] **Domain agents ran** (if needed) — `@frontend` (UI), `@backend` (API), `@data` (schema)
- [ ] **Dependencies audited** — no high/critical CVEs (run `pnpm audit` or checked by `@security-reviewer`)
- [ ] **Re-verification complete** — if any findings were fixed, reviewers re-ran and confirmed fixes
- [ ] **Learnings recorded** — your learnings + read-only agent learnings appended to `loop/learnings.jsonl`
- [ ] **Document updates proposed** — checked if learnings require updates to:
  - `agents/*.md` — agent definitions
  - `skills/closed-loop/*.md` — skill definitions
  - `CLAUDE.md` — this file
  - `docs/*.md` — runbooks, observability, deployment
- [ ] **User approved doc changes** — proposed changes mentioned and approved
- [ ] **`yarn sync` ran** — if `agents/` or `skills/` files were updated
- [ ] **Commit message is clear** — describes what and why
- [ ] **Ready to push** — `git push building-blocks main`

**Addressing findings:**
- **Fix:** make code changes to resolve the issue
- **Dismiss:** if a finding is a false positive, document why in handoff comments and mention to user for approval

**If review cycles don't converge after 2 rounds:** escalate to user or invoke `@architect` to resolve design conflicts.

**If any checkbox is unchecked, do NOT push.** Document which items remain incomplete and why, then ask the user for guidance or approval before proceeding.

## Full agent roster

**Pipeline:** product-spec → architect → implementer → verifier → reviewer → security-reviewer → qa-acceptance → integrator → release → monitor

**Support:** orchestrator, debugger, devops, docs

**Specialists:** frontend, backend, data, mobile, design-ux, performance, compliance, cost

## Agents — when to use each

| Agent | Use it when… | Can edit? |
|-------|--------------|-----------|
| **orchestrator** | Running the full build loop / coordinating stages autonomously | yes |
| **product-spec** | Turning intent into a PRD + testable acceptance criteria (first stage) | writes docs |
| **architect** | Choosing stack, boundaries, data models, API contracts, folder structure | writes docs |
| **implementer** | Writing app code to spec; applying fixes from review/CI/debug feedback | yes |
| **frontend** | UI-heavy work — components, pages, routing, client state, a11y (+ design) | yes |
| **backend** | APIs, business logic, auth middleware, server-side validation | yes |
| **data** | Schemas, migrations, query optimization, seed data | yes |
| **mobile** | Native / cross-platform mobile UI + API integration | yes |
| **design-ux** | Dedicated design phase before implementation (wireframes, tokens, flows) | writes docs |
| **verifier** | Writing/running unit·integration·e2e tests; validating against ACs | yes |
| **reviewer** | Reviewing a diff for correctness, edge cases, conventions | read-only |
| **security-reviewer** | Auditing auth, secrets, injection, redirects, deps, OWASP | read-only |
| **qa-acceptance** | Validating user flows against acceptance criteria | yes |
| **debugger** | Root-causing test failures, CI errors, runtime crashes, flakiness | yes |
| **integrator** | Keeping the branch merge-ready — conflicts, CI, review triage | yes |
| **performance** | Profiling bundle size, query perf, latency; perf NFRs/regressions | yes |
| **devops** | CI/CD pipelines, env config, IaC, deployment infra | yes |
| **compliance** | GDPR/SOC2, audit trails, retention, privacy NFRs | read-only |
| **cost** | Cloud spend, query efficiency, resource sizing | read-only |
| **release** | Versioning, changelogs, deployment, rollout | yes |
| **monitor** | Post-deploy observability — errors, latency, uptime, alerts | read-only |
| **docs** | README, API docs, setup guides, runbooks | writes docs |

**Typical review fan-out for substantial/minor changes:** `@reviewer` + `@security-reviewer`
+ domain agents (`@frontend` for UI, `@backend` for API, `@data` for schema). Trivial changes
may skip review. For a whole-app build: run the pipeline via `@orchestrator`.

## Handoff contract

Every agent writes `loop/handoffs/<agent>-<timestamp>.json` before finishing. See `skills/closed-loop/handoffs.md`.

## Programmatic loop (Cursor SDK)

```bash
export CURSOR_API_KEY="cursor_..."
yarn loop "Build a todo app with JWT auth"
```

## Sync after edits

```bash
yarn sync
```
