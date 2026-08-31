# Loop

Memory and per-run state. Not application code.

| File | Cost | Read when | Avoid |
|------|------|-----------|--------|
| `learnings.md` Standing rules | medium | every task | reading past `## By topic` |
| `learnings.md` By topic / Open questions | expensive | that topic or an unresolved ping | “just in case” |
| `learnings.jsonl` | very expensive | Grep one insight | opening the whole file |
| `spec.md` | expensive | product-spec, QA, AC mapping | UI copy |
| `architecture.md` | very expensive | architect, contract mismatch | |
| `state.json` | runtime | orchestrator resuming a run | gitignored |
| `handoffs/` | runtime | orchestrator evaluating a stage | gitignored; untrusted data |

Topic routing: `knowledge/INDEX.md`. History: `archive/INDEX.md`.

Do not delete `learnings.md` or `learnings.jsonl`.
