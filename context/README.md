# Repo context

This folder is **this repository’s** facts. Agents in `agents/` are generic:
they read this folder and the live code. They do not embed product names,
design tokens, git remotes, or a package manager.

If you are an agent, read these files **in order** before doing work:

| File | What it is |
|------|------------|
| `context/profile.json` | Name, stack, package managers, paths to spec/design |
| `context/gates.json` | Quality gates and how each was proven to fail |
| `context/trust.md` | Trust boundaries and irreversible writes |
| `context/git.md` | Remotes, default branch, review-then-push, required CI checks |
| `context/conventions.md` | How to match this codebase |
| Design file in `profile.json` `paths.design` | Live tokens — never copy them into an agent |
| `loop/learnings.md` | This repo’s memory (your section + `all`) |

## Domain context

Domain-specific patterns and rules live in `context/<domain>.md`. These files
describe **how** to build (patterns, states, a11y rules) — not **what** to build
with (tokens, hex values, config). Live values stay in the codebase files that
`profile.json` `paths` points to.

| File | Relevant to | What it covers |
|------|-------------|----------------|
| `context/ux.md` | implementer, reviewer, qa-acceptance | Principles, component states, visual design bar |
| `context/ux-process.md` | implementer (new screens) | Design process, screen states, critique checklist |
| `context/ux-patterns.md` | implementer (interactions) | Motion, microinteractions, UX writing, flow patterns |
| `context/ux-accessibility.md` | implementer, reviewer | WCAG 2.1 AA, responsive breakpoints, mobile UX |

Add a `context/<domain>.md` when a deleted specialist’s knowledge needs to
survive for the implementer or reviewers. Don’t add domain files for knowledge
that already lives in codebase files (design tokens, API schemas, DB migrations).

## Notes

Kernel protocol (every repo): `skills/closed-loop/protocol.md` and
`skills/closed-loop/gates.md`. Do not confuse kernel gates with
`context/gates.json` (this repo’s CI commands).

When adding a fact that is true only here, put it in **this folder** (or
the ledger), not in `agents/*.md`.

This `context/` is **building-blocks**. The empty template lives in
`pack/templates/context/` and in [closed-loop-agents](https://github.com/leeran7/closed-loop-agents).
