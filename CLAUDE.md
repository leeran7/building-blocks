# Building Blocks

Product repo for **The Climb** / paid stacks (`app/`). Agent roles are generic
and live in the pack; **this repo’s facts are in `context/`**.

| | Path |
|--|------|
| This product’s facts | [`context/README.md`](context/README.md) |
| File tree + how to vendor the pack | [`pack/SETUP.md`](pack/SETUP.md) |
| Template repo | [leeran7/closed-loop-agents](https://github.com/leeran7/closed-loop-agents) |
| Kernel protocol / gates | `skills/closed-loop/protocol.md`, `gates.md` |
| Memory | `loop/learnings.md` |

Edit `agents/` or `skills/`, then `yarn sync`. To refresh the template repo:
`node scripts/export-template.mjs /path/to/closed-loop-agents`.

## Agent review is mandatory

Substantial: `@reviewer` + `@security-reviewer` + domain agents. Minor: both
reviewers. Trivial (no code): optional. Docs with scripts: both reviewers.
Fix critical findings and re-run until `status: success`. Persist read-only
agents’ `learnings` into `loop/learnings.jsonl`.

Product facts go in `context/` or the ledger. Kernel-generic `[all]` lessons
are proposed for `skills/closed-loop/gates.md`. Do not paste them into all
22 agent files.

Git remotes and branch policy: `context/git.md`. Package managers and
gates: `context/profile.json` and `context/gates.json`.

Closed loop (any scoped goal): `@orchestrator`, `/closed-loop`, or `yarn loop "…"`.
