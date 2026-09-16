# Closed-loop host instructions

Generic body for `CLAUDE.md` / `AGENTS.md`. `init-pack` writes this when
those files do not already exist. Product facts belong in `context/`, not
here.

**New repo?** Start at [`pack/SETUP.md`](pack/SETUP.md) (file tree +
5-minute install).

## What this repo uses

| | Path |
|--|------|
| Setup / file tree | `pack/SETUP.md` |
| This product’s facts | `context/README.md` |
| Protocol | `skills/closed-loop/protocol.md` |
| Kernel gates | `skills/closed-loop/gates.md` |
| Memory | `loop/learnings.md` + `loop/learnings.jsonl` |
| Roles | `agents/*.md` (sync to `.cursor/agents/` and `.claude/agents/`) |

Edit `agents/` or `skills/`, then run `node scripts/sync.mjs`.

## Agent review is mandatory

No exceptions except production hotfixes (push first, complete review within
24 hours).

| Change | Required review |
|--------|-----------------|
| Substantial (new features, refactors, security-sensitive, >50 LOC, >3 files) | `@reviewer` + `@security-reviewer` + domain agents |
| Minor (<50 LOC) | `@reviewer` + `@security-reviewer` |
| Trivial (comment typo, README formatting, no code) | none |
| Docs with code/scripts | `@reviewer` + `@security-reviewer` |

Read the ledger → implement → dispatch reviewers in parallel → fix
**critical** findings → re-run until `status: success` → record learnings.

Read-only reviewers cannot write `loop/`. The caller persists their
`learnings` arrays.

Do not paste new standing rules into all 22 agent files. Product facts go
in `context/` or `loop/learnings.md`. Kernel-generic `[all]` lessons are
proposed for `skills/closed-loop/gates.md`.

## Orchestrator must run the team

When `@orchestrator`, `/closed-loop`, or `yarn loop` is in play, dispatch
each required member with `subagent_type` equal to the agent name. A
missing handoff is **failed**. After verifier: `reviewer` and
`security-reviewer` in the same message. See `skills/closed-loop/team.md`.

## Loop runtime

`loop/state.json` and `loop/handoffs/` are per-run (gitignored).
`loop/learnings.md` and `loop/learnings.jsonl` are persistent memory.

## Start a whole-app loop

- Cursor: `@orchestrator` or the closed-loop skill
- Claude Code: `/closed-loop`
- Programmatic: `yarn loop "…"` (`CURSOR_API_KEY`)
