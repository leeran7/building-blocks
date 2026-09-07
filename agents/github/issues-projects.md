# Issues, types, fields, and Projects

Knowledge current as of mid-2026 GitHub platform updates.

## Issue types (org-level)

Organizations define issue types (bug, feature, …) under planning settings.
Types standardize classification across repositories. Prefer types over
overloaded label taxonomies when the org has configured them.

```bash
gh issue create --title "..." --body "..." --type "<type>"
gh issue edit <n> --type "<type>"
gh issue list --type "<type>"
```

Requires GitHub CLI **≥ 2.94.0** for type / hierarchy flags.

## Issue fields (GA, 2026)

Org-scoped typed metadata on every issue: default fields often include
`Priority`, `Effort`, `Start date`, `Target date`. Field kinds: single
select, text, number, date. Visible on issue lists and in Projects; filterable
in search; settable via REST/GraphQL and GitHub MCP.

Use fields for priority/effort — not a growing pile of colored labels — when
the org has enabled them.

## Sub-issues and dependencies

```bash
gh issue create ... --parent <n>
gh issue edit <n> --set-parent <n> | --remove-parent
gh issue edit <n> --blocked-by <n> | --blocking <n>
# also --add-blocked-by / --remove-blocked-by (and blocking variants)
```

`gh issue view` / `list` JSON includes parent, sub-issues, type, and
dependency fields for automation.

## Projects (v2)

- Prefer Projects for board/roadmap views; keep **source of truth for
  engineering state** on the issue (type, fields, milestones) so CLI/MCP
  agents can act without scraping board UI.
- Mirror critical field columns in the project view; avoid duplicating the
  same status in labels + fields + project single-selects.
- Automations: Actions + `gh` + GraphQL project items APIs — keep tokens
  minimal (`issues: write`, `project` scopes as needed).

## Agent practice

1. Before opening work: search existing issues (`gh issue list` / search) to
   avoid duplicates.
2. Set type + priority/effort fields when available.
3. Link PRs with `Fixes #n` for the landing PR (bottom of stack if stacked).
4. Use sub-issues for decompositions that are not commit layers; use **stacks**
   for commit/review layers that must land in order.
