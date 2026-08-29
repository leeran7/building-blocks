# Closed-loop pack — reusable agents for any repo

This file is the overview of the pack: what is kernel, what is a consuming
repo, how to install it, and how learnings make the kernel stricter without
making every agent file longer.

The pack is the agent system (`agents/`, `skills/closed-loop/`, `orchestrator/`,
`scripts/`). It is **not** the product in `app/`. A second repo should be able
to vendor the pack and run the same loop against a different stack.

**File tree and install (start here):** [`pack/SETUP.md`](pack/SETUP.md).
Repo-owned facts live in `context/`. Agents only point at that folder.

## Why the old layout did not travel

Everything lived in one blob:

| Mixed in | Example | Breaks reuse because |
|----------|---------|----------------------|
| Protocol | Learning loop + handoff JSON copied into all 22 agents | Drift; 20–30% of each file is identical |
| Role | "You are the verifier" | This *should* travel |
| Product | Tower Dark Editorial tokens, `#00d4ff`, BlockRow | Wrong the moment the design system moves |
| Host policy | `git push building-blocks main`, dual remotes | Other repos have different git |
| Runtime memory | `loop/learnings.md` standing rules | Mixes "never grep-assert" (universal) with lava O(n²) (this game) |

Two concrete failures in this repo:

1. **Stale product facts in agents.** `frontend.md` / `design-ux.md` still
   specified cyan Inter / JetBrains after `app/DESIGN.md` became ASCENT
   (signal lime, ember, Bricolage). Fat encyclopedias drift; a path to the
   live design file does not.
2. **Standing rules had nowhere to go except longer agents.** The Aug 29
   review proposed pasting new bullets into `verifier.md`, `reviewer.md`,
   and `implementer.md`. Those lessons already belong in the ledger. Kernel
   lessons now graduate to `gates.md`. Product lessons stay in the repo
   ledger. Agent files stop growing.

## Four layers

```
┌─────────────────────────────────────────────────────────────────┐
│  4. MEMORY     loop/learnings.md + learnings.jsonl              │
│                Per-repo. Version the ledger, gitignore the rest │
│                of loop/. Product-specific. Never ships in pack. │
├─────────────────────────────────────────────────────────────────┤
│  3. CONTEXT    context/                                         │
│                Per-repo folder: profile, gates, trust, git,     │
│                conventions. Schema: pack/profile.schema.json    │
├─────────────────────────────────────────────────────────────────┤
│  2. ROLES      agents/*.md                                      │
│                Kernel. Identity + unique workflow + hard rules. │
│                No protocol copy, no product hex, no "use pnpm". │
├─────────────────────────────────────────────────────────────────┤
│  1. KERNEL     skills/closed-loop/{protocol,gates,handoffs,     │
│                team,stages,learning-loop,SKILL}.md              │
│                + orchestrator + scripts                         │
│                Identical in every consuming repo.               │
└─────────────────────────────────────────────────────────────────┘
```

Host adapters (`.cursor/agents/`, `.claude/agents/`, generated CLAUDE
preamble) are **not** a fifth source of truth. `yarn sync` builds them
from layers 1–2 and points at 3–4.

## What travels vs what stays

**Pack (copy into another repo):**

- `agents/*.md` and `agents/claude.config.json`
- `skills/closed-loop/*.md`
- `handoffs/schema.json`
- `pack/` (schemas, templates, manifest)
- `scripts/sync.mjs`, `scripts/init-pack.mjs`, `scripts/export-template.mjs`, `scripts/hygiene.mjs`
- `orchestrator/` (the programmatic loop)

**Consuming repo (never copied from here as "the pack"):**

- `app/` and any product code
- `context/` (write from `pack/templates/context/`)
- `loop/learnings.md` + `loop/learnings.jsonl`
- Host git policy, remotes, trunk vs PR
- `CLAUDE.md` / `AGENTS.md` once customized

## Install into another repo

**Canonical steps and file tree:** [`pack/SETUP.md`](pack/SETUP.md).

From a pack clone ([closed-loop-agents](https://github.com/leeran7/closed-loop-agents)
or this tree):

```bash
node scripts/init-pack.mjs /path/to/other-repo
```

That vendors the pack, writes `context/` from `pack/templates/context/` if
missing, writes an empty ledger, appends the gitignore snippet, and runs
sync. Then edit **your** `context/` — not `agents/`.

Refresh the template repo from a product checkout:

```bash
node scripts/export-template.mjs /path/to/closed-loop-agents
```

Do **not** copy this repo's `loop/learnings.md` body or filled-in
`context/`. Other products inherit `skills/closed-loop/gates.md`, not
product memory.

## Runtime: how an agent sees the layers

1. **Cursor / Claude Code** — platform agent file = protocol (prepended by
   sync) + role body. Skills live under `.cursor/skills/closed-loop/` or
   `.claude/skills/closed-loop/`. The agent reads `context/` and the ledger.
2. **`yarn loop`** — `buildStagePrompt` wraps goal, **repo `context/`**,
   prior handoff, and learnings as untrusted data, then the role body.

Either path: missing handoff file → stage **failed**.

## Learnings → kernel (promotion)

| Kind | Lives in | Example |
|------|----------|---------|
| Product | `loop/learnings.md` | Power-up stacking vs one slot; `canvas.width` clears the bitmap |
| Kernel | `skills/closed-loop/gates.md` | Prove a gate fails; never grep-assert behaviour |
| Role invariant | that agent's `## Hard rules` | Verifier does not fix production code |

Promote a ledger standing rule into `gates.md` only when it is
product-agnostic **and** either seen in two repos or independently found
by two agents with `forAgents: ["all"]`. That is a pack change, not a
drive-by edit of 22 agent files.

Do not paste kernel gates back into every agent. Point at `gates.md`.

## Quality gates in the profile

A gate that has never been shown to go red is not a gate (Aug 29: `next
lint` with no ESLint config exited 0). Each `context/gates.json`
`gates[]` entry should include `proveFail`: a command that must fail on a
known-bad input.

The verifier and devops agents read this list. They do not invent
`pnpm lint` because a template once said so.

## Hygiene

`scripts/hygiene.mjs` fails the pack if any source agent contains product
leakage (design hexes, this repo's git remote, hardcoded exclusive package
manager, the old design-resource URL list). `yarn sync` runs hygiene first.

## Roster (unchanged jobs, slimmer files)

Required on a **whole-app** closed-loop run:

`product-spec → architect → implementer → verifier → reviewer +
security-reviewer → qa-acceptance → integrator`

Optional: `design-ux`, `devops`, `docs`, `release`, `monitor`, `debugger`.

Specialists (delegated from implementer, not pipeline stages): `frontend`,
`backend`, `data`, `mobile`, `performance`, `compliance`, `cost`.

Incremental work in an existing repo uses the host review classification
(substantial / minor / trivial) — not the eight-agent clamp. The clamp is
for `@orchestrator` / `yarn loop`.

## File map

| Path | Layer |
|------|--------|
| `pack/SETUP.md` | Install + file tree (start here) |
| `skills/closed-loop/protocol.md` | Kernel preamble (sync + `loadAgentPrompt` prepend) |
| `skills/closed-loop/gates.md` | Universal quality gates |
| `skills/closed-loop/profile.md` | `context/` contract |
| `skills/closed-loop/handoffs.md` | Handoff JSON contract |
| `skills/closed-loop/learning-loop.md` | Ledger protocol |
| `skills/closed-loop/team.md` | Dispatch contract |
| `skills/closed-loop/stages.md` | Stage graph |
| `skills/closed-loop/host.md` | Generic CLAUDE/AGENTS body |
| `agents/*.md` | Roles (point at `context/`) |
| `context/` | This repo's facts |
| `pack/templates/context/` | Empty context for a new repo |
| `pack/profile.schema.json` | `context/profile.json` schema |
| `loop/learnings.md` | This product's memory |

