# Work split

Read this before the spec's **Work split** section. A change that is too big
for one reviewable PR gets built by several parallel workers: threads,
subagents or sessions. Each works on its own branch. The split decides whether
they finish cleanly or collide at merge time.

## When to split

**Split when:** the flows separate into groups that can be built and tested on
their own (engine vs. server vs. UI, or one feature per group), and waiting for
one stream to finish would stall the others.

**Do not split when:** the change is one reviewable concern, or every stream
would edit the same few files. In that case one worker is faster than merging
many.

## One row per workstream

| Field | Spec it as |
|-------|------------|
| Stream | W-1… with a short name the user would recognise |
| Flows / ACs | The F-n and AC-n it delivers. Every AC has exactly one owner. |
| Owns | Files and directories only this stream edits |
| Branch | `<prefix>/<stream>`; its PR targets the feature branch, not trunk |
| Depends on | Streams whose merged types or schema it needs. Stack on that branch only if it cannot start without them. |
| Generated outputs | Artifacts it must regenerate when its inputs change (data files, lockfiles, fixtures) |

## Shared surface

List every file, type and contract that more than one stream touches. These
are where the merges will conflict.

- **Shared types** (a report shape, a response payload, a props type): name
  one stream as the owner. Other streams add fields only, and never rename or
  remove one. When the owner adds a required field, every other stream's
  fixtures break at merge time, and only typecheck catches it.
- **Shared screens and components**: expect conflicts. Streams should add
  props and branches next to each other rather than rewrite blocks.
- **Shared queries and selects**: when a stream needs a new column, it adds it
  to the shared select, not to a private copy that another stream's refactor
  would drop.
- **Migrations**: additive only, with timestamps that sort in merge order.

## Integration plan

- **Feature branch:** one `feat/<topic>` branch cut from trunk. Every stream's
  PR merges into it, and one PR takes it into trunk.
- **Merge order:** foundations first (engine, schema), then consumers. A
  stacked stream merges right after its base.
- **Who integrates:** one named worker merges the streams, resolves conflicts
  and drives the trunk PR to green. It follows `skills/github/feature-branch.md`.
- **Follow-ups:** until the feature branch merges, fixes go as new PRs into it,
  not into trunk.
- **Deploy prerequisites:** secrets, flags and migrations a human must handle
  before the trunk PR merges. List them so the trunk PR can carry them.
