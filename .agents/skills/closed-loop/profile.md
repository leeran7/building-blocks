# Repo context (`context/`)

Each consuming repo owns a `context/` folder. Agents never embed product
facts; they read this folder. Schema for `profile.json`:
[`pack/profile.schema.json`](pack/profile.schema.json).

Templates for a new repo: [`pack/templates/context/`](pack/templates/context/).
Full tree and install steps: [`pack/SETUP.md`](pack/SETUP.md).

## Files

| File | Required | Contents |
|------|----------|----------|
| `README.md` | yes | Index — what to read, in what order |
| `profile.json` | yes | Name, stack, package managers, paths |
| `gates.json` | yes | Quality gates with `proveFail` |
| `trust.md` | recommended | Irreversible writes, money, secrets |
| `git.md` | recommended | Remote, default branch, PR policy |
| `conventions.md` | recommended | How to match this tree |

## `profile.json`

| Field | Why |
|-------|-----|
| `name` | Host repo identity |
| `packageManagers` | Per-path `yarn` / `pnpm` / `npm` |
| `stack` | Concern → choice (`app`, `db`, `auth`, …) |
| `paths` | spec, architecture, learnings, design, and the other context files |

## `gates.json`

Each gate needs `name`, `command`, and `proveFail` (a known-bad input that
must go red). See [gates.md](gates.md) rule 1.

## Missing `context/`

Agents infer from lockfiles and existing code. The orchestrator still
runs; the prompt says context is missing so nobody invents a second stack.
