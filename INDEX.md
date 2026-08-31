# Agent filesystem

Read this file first. Do not load the rest of the tree.

## Start

1. `RULES.md` — authority order and always-on constraints (short).
2. `MAP.md` — only if you do not know which directory to open.
3. Then **one** branch INDEX, then **only** the files that index marks for this task.

Stop as soon as you can do the work.

## Global

| File | Read when |
|------|-----------|
| `RULES.md` | every task, once per session |
| `MAP.md` | you need a path, not a rule |
| `CLAUDE.md` | skip — it only points here |

## By task

| Task | Next |
|------|------|
| Whole-app closed loop | `workflows/closed-loop.md` |
| Implement / fix product code | `workflows/implement.md` |
| Review a diff | `workflows/review.md` |
| Debug a failure | `workflows/debug.md` |
| Ship / deploy | `workflows/release.md` |
| Edit agents or the pack | `workflows/sync.md` |

## By domain

| Domain | Path | Read when |
|--------|------|-----------|
| This product’s facts | `context/README.md` | any product work |
| Roles | `agents/INDEX.md` | dispatching or editing a role |
| Kernel loop | `skills/closed-loop/INDEX.md` | changing the loop itself |
| Memory / spec | `loop/INDEX.md` | learnings, spec, architecture |
| Ops docs | `references/INDEX.md` | runbook, deploy, schemas |
| History | `archive/INDEX.md` | **never** unless the task is historical |

Indexes are routing. They are not knowledge.
