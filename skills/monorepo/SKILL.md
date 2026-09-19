---
name: monorepo
description: >-
  Monorepo workspace tooling, dependency graphs, and selective CI. Use when
  structuring multi-package repos, configuring workspaces, or optimizing CI
  to build only what changed.
---

# Monorepo Skill

A monorepo earns its complexity only when packages share a release cadence or
a dependency. Unrelated projects in one repo is not a monorepo — it's a mess.

## Workspace structure

```
packages/
  shared/          # shared types, utils — no UI, no server deps
  ui/              # component library
  api/             # server
  web/             # frontend app
```

- Each package has its own `package.json`, `tsconfig.json`, and test command.
- Shared packages are referenced by workspace protocol (`"shared": "workspace:*"`),
  never by relative path or `file:`.
- The root `package.json` holds only workspace config and dev tooling (lint,
  format, husky). No application dependencies at root.

## Dependency graph rules

1. **Acyclic.** If A depends on B, B must never depend on A. Enforce with a
   lint rule or `madge --circular`.
2. **Leaf packages have no internal dependents.** Apps (`web/`, `api/`) are
   leaves — nothing else imports from them.
3. **Shared packages don't import from apps.** Direction is always
   shared → library → app.
4. **Version internal deps at workspace protocol.** Never pin a specific
   version of a sibling package.

## Selective CI

Only build and test what changed. The full matrix on every PR kills velocity.

### By file path

```yaml
on:
  pull_request:
    paths:
      - 'packages/api/**'
      - 'packages/shared/**'
```

### By dependency graph

Use `turbo run test --filter=...[origin/main]` or equivalent. The filter
computes changed packages and their dependents.

### Required checks

- A path-filtered workflow produces a **skipped** check, not a missing one.
  Rulesets that require the check will block merge on a missing check.
- Use a status-aggregator job that always runs and reports success/failure
  based on its dependencies. Make this the required check.

## Build caching

- Cache by lockfile hash and workspace-specific source hash.
- `turbo` / `nx` remote caching reduces CI time for unchanged packages.
- Never cache `node_modules` directly — cache the package manager's store.
- Invalidate on: lockfile change, engine version change, build config change.

## Cross-package changes

When a change spans multiple packages:

1. Start from the lowest layer (shared/utils).
2. Update dependents bottom-up.
3. Run tests at each layer before moving up.
4. One PR for tightly coupled cross-package changes. Stacked PRs for
   independent layers.

## Don't

- Import from one app package into another app package
- Hoist all dependencies to root (it hides missing `package.json` entries)
- Run the full test suite on every PR when only one package changed
- Use different versions of the same dependency across packages without
  a documented reason
- Create a shared package for code used by only one consumer
