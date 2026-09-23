# Closed-loop host instructions

Generic body for `CLAUDE.md` / `AGENTS.md`. `init-pack` writes this when
those files do not already exist. Product facts belong in `context/`, not
here.

**New repo?** Start at [closed-loop-agents `pack/SETUP.md`](https://github.com/leeran7/closed-loop-agents/blob/main/pack/SETUP.md)
(file tree + 5-minute install).

## What this repo uses

| | Path |
|--|------|
| Setup / file tree | closed-loop-agents `pack/SETUP.md` |
| This product’s facts | `context/README.md` |
| Protocol | `skills/closed-loop/protocol.md` (local override) |
| Kernel gates | `skills/closed-loop/gates.md` (local override) |
| Memory | `loop/learnings.md` (open questions only) |
| Roles | `agents/*.md` — this repo's roster (`context/profile.json` `agentRoster`), sync to `.cursor/`, `.claude/`, `.codex/` |

Roles/skills come from the `closed-loop-agents` package by default; edit
this repo's own `agents/` or `skills/` to override or add, then run `yarn
sync`.

## Agent review is mandatory

No exceptions except production hotfixes (push first, complete review within
24 hours).

| Change | Required review |
|--------|-----------------|
| Substantial (new features, refactors, security-sensitive, >50 LOC, >3 files) | `@reviewer` + `@security-reviewer` + domain agents |
| Minor (<50 LOC) | `@reviewer` + `@security-reviewer` |
| Trivial (comment typo, README formatting, no code) | none |
| Docs with code/scripts | `@reviewer` + `@security-reviewer` |

Implement → dispatch reviewers in parallel → fix **critical** findings →
re-run until `status: success`. The orchestrator retro promotes learnings.

Read-only reviewers cannot write `loop/`. The caller persists their
`learnings` arrays.

Do not paste rules into agent files. Product facts go in `context/`.
Open questions go in `loop/learnings.md`. Kernel-generic lessons are
proposed for `skills/closed-loop/gates.md`.

## Orchestrator must run the team

When `@orchestrator`, `/closed-loop`, or `yarn loop` is in play, dispatch
each required member with `subagent_type` equal to the agent name. A
missing handoff is **failed**. After verifier: `reviewer` and
`security-reviewer` in the same message. See `skills/closed-loop/team.md`.

## Loop runtime

`loop/state.json` and `loop/handoffs/` are per-run (gitignored).
`loop/learnings.md` holds open questions only (persistent, versioned).

## Start a whole-app loop

- Cursor: `@orchestrator` or the closed-loop skill
- Claude Code: `/closed-loop`
- Codex: `/closed-loop`
- Programmatic: `yarn loop "…"` (`CURSOR_API_KEY`)
