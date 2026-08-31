# Map

Progressive disclosure. Descend only when INDEX says to.

```
INDEX.md                 ← start (routing)
RULES.md                 ← always-on constraints
MAP.md                   ← this file
CLAUDE.md                ← host stub → INDEX.md
agents/                  roles (Cursor/Claude dispatch)
skills/closed-loop/      kernel protocol, stages, gates
context/                 this product’s facts
loop/                    memory + per-run state
workflows/               task routing
domains/                 domain → path aliases
knowledge/               memory aliases into loop/
pack/                    how to vendor the pack
references/              schemas, ops docs, pack design
archive/                 history; skip
app/                     product code (not agent docs)
orchestrator/            yarn loop runtime
```

## Cheap (default)

`INDEX.md` → `RULES.md` → one workflow or `context/README.md` → one role file.

## Expensive (opt-in)

| Path | Why it is deep |
|------|----------------|
| `loop/learnings.md` after Standing rules | topic dump |
| `loop/learnings.jsonl` | 100KB+ event log; Grep one line |
| `loop/spec.md` | full PRD |
| `loop/architecture.md` | full design |
| `skills/closed-loop/pack.md` | pack rationale |
| `archive/` | historical notes; skip unless named |

`skills/closed-loop/gates.md` is required for tests, review, CI, money, and auth — not a dump to skip.

## Do not

- Read every file in `context/`
- Read generated `.cursor/agents/` or `.claude/agents/` (rebuild with `node scripts/sync.mjs`)
- Load archive to answer a current question
