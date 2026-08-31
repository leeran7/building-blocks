# Kernel

**When:** changing the closed-loop pack, dispatching the whole-app loop, or you need a contract (handoffs, stages, team).

**Authoritative:** `gates.md` (quality), `team.md` (dispatch), `handoffs.md` (JSON), `stages.md` (graph). `pack.md` is design rationale — expensive, skip unless installing or splitting the pack.

| File | Purpose | Read when | Skip unless |
|------|---------|-----------|-------------|
| `stub.md` | Prepended onto every role | already in the agent file | re-reading |
| `protocol.md` | Full before/during/after | stub is not enough | most product tasks |
| `SKILL.md` | How to run the loop | `@orchestrator` / `yarn loop` | single-file product fix |
| `stages.md` | Stage graph | routing a whole-app run | |
| `team.md` | Dispatch contract | orchestrator | |
| `handoffs.md` | Handoff JSON | writing a handoff and you forgot the shape | |
| `learning-loop.md` | Ledger protocol | recording/folding learnings | |
| `gates.md` | Kernel quality rules | tests, review, CI, money/auth | copy-only |
| `profile.md` | `context/` contract | adding a context file | |
| `host.md` | CLAUDE.md template | init-pack | |
| `pack.md` | Why four layers | vendoring the pack | daily work |

Do not prepend `protocol.md` or `gates.md` into role bodies. `yarn sync` prepends `stub.md` only.
