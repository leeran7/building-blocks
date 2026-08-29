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
| `context/git.md` | Remotes, default branch, review-then-push |
| `context/conventions.md` | How to match this codebase |
| Design file in `profile.json` `paths.design` | Live tokens — never copy them into an agent |
| `loop/learnings.md` | This repo’s memory (your section + `all`) |

Fill in every placeholder. Kernel protocol: `skills/closed-loop/protocol.md`
and `skills/closed-loop/gates.md`. Install guide: `pack/SETUP.md`.
