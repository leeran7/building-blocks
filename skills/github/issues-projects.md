# Issues, types, fields, and Projects

## Issue types (org-level)

Organizations define issue types (bug, feature, ...) under planning settings.

```bash
gh issue create --title "..." --body "..." --type "<type>"
gh issue list --type "<type>"
```

## Issue fields

Org-scoped typed metadata: Priority, Effort, Start date, Target date. Use
fields for priority/effort -- not a growing pile of colored labels.

## Sub-issues and dependencies

```bash
gh issue create ... --parent <n>
gh issue edit <n> --blocked-by <n> | --blocking <n>
```

## Projects (v2)

- Keep source of truth on the issue (type, fields, milestones).
- Mirror critical field columns in the project view.
- Automations: Actions + `gh` + GraphQL project items APIs.

## Agent practice

1. Search existing issues before opening new ones.
2. Set type + priority/effort fields when available.
3. Link PRs with `Fixes #n`.
4. Use sub-issues for decompositions; use stacks for commit layers.
