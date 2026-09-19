# Repo context (template)

This folder is **this repository’s** facts. Generic agents in `agents/` only
point here — they do not embed product names, tokens, remotes, or a package
manager.

Read these files **in order** before doing work:

| File | What it is |
|------|------------|
| `context/profile.json` | Name, stack, package managers, paths |
| `context/gates.json` | Quality gates and how each was proven to fail |
| `context/trust.md` | Trust boundaries and irreversible writes |
| `context/git.md` | Remotes, default branch, review-then-push, required CI |
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
| `context/ux.md` | software-engineer, reviewer, qa-acceptance | Principles, component states, visual design bar |
| `context/ux-process.md` | software-engineer (new screens) | Design process, screen states, critique checklist |
| `context/ux-patterns.md` | software-engineer (interactions) | Motion, microinteractions, UX writing, flow patterns |
| `context/ux-accessibility.md` | software-engineer, reviewer | WCAG 2.1 AA, responsive breakpoints, mobile UX |

Add a `context/<domain>.md` when a domain has rules the software-engineer or
reviewers need. Don’t duplicate what’s already in codebase files.

## Notes

Fill in every placeholder. Kernel protocol: `skills/closed-loop/protocol.md`
and `skills/closed-loop/gates.md`. Install guide: `pack/SETUP.md`.
