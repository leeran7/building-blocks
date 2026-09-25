# Closed-loop pack — reusable agents for any repo

This file is the overview of the pack: what is kernel, what is a consuming
repo, how to install it, and how learnings make the kernel stricter without
making every agent file longer.

The pack is the agent system (`agents/`, `skills/closed-loop/`,
`orchestrator/`, `scripts/`), published as the `closed-loop-agents` npm
package (installed at `node_modules/closed-loop-agents`). It is **not** the
product in `app/`. This repo's own `agents/` and `skills/` hold only local
overrides/additions on top of that package — see "What travels vs what
stays" below.

**File tree and install (start here):** [closed-loop-agents `pack/SETUP.md`](https://github.com/leeran7/closed-loop-agents/blob/main/pack/SETUP.md).
Repo-owned facts live in `context/`. Agents only point at that folder.

## Why the old layout did not travel

Everything lived in one blob:

| Mixed in | Example | Breaks reuse because |
|----------|---------|----------------------|
| Protocol | Learning loop + handoff JSON copied into all agents | Drift; 20–30% of each file is identical |
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
   and `software-engineer.md`. Those lessons already belong in the ledger. Kernel
   lessons now graduate to `gates.md`. Product lessons stay in the repo
   ledger. Agent files stop growing.

## Four layers

```
┌─────────────────────────────────────────────────────────────────┐
│  4. MEMORY     loop/learnings.md (open questions only)          │
│                Per-repo. Version it, gitignore the rest of      │
│                loop/. Product-specific. Never ships in pack.    │
├─────────────────────────────────────────────────────────────────┤
│  3. CONTEXT    context/                                         │
│                Per-repo folder: profile, gates, trust, git,     │
│                conventions. Schema: pack/profile.schema.json    │
├─────────────────────────────────────────────────────────────────┤
│  2. ROLES      agents/*.md (+ agents/<role>/*.md partials)    │
│                Kernel. Identity + unique workflow + hard rules. │
│                No protocol copy, no product hex, no "use pnpm". │
│                Each file ≤ 200 lines — split and reference.     │
├─────────────────────────────────────────────────────────────────┤
│  1. KERNEL     skills/closed-loop/{protocol,gates,handoffs,     │
│                team,stages,learning-loop,SKILL}.md              │
│                + orchestrator + scripts                         │
│                From node_modules/closed-loop-agents by default; │
│                this repo overrides roster + orchestrator.       │
└─────────────────────────────────────────────────────────────────┘
```

Host adapters (`.cursor/agents/`, `.claude/agents/`, generated CLAUDE
preamble) are **not** a fifth source of truth. `yarn sync` builds them
from layers 1–2 and points at 3–4.

## What travels vs what stays

**Package (`node_modules/closed-loop-agents`, owned by
[closed-loop-agents](https://github.com/leeran7/closed-loop-agents)):**

- `agents/*.md` and `agents/claude.config.json` (generic defaults)
- `skills/closed-loop/*.md` (generic default)
- `handoffs/schema.json` (generic default)
- `pack/` (schemas, templates, manifest, hygiene rules)
- `bin/cli.mjs`, `scripts/{sync,init-pack,hygiene}.mjs`
- `orchestrator/` (the programmatic loop)

**This repo's own `agents/`, `skills/`, `handoffs/schema.json`, `pack/hygiene-rules.json`
(local overrides/additions — a same-named file wins over the package's):**

- `agents/{software-engineer,orchestrator,verifier,reviewer,security-reviewer,qa-acceptance,integrator}.md` —
  this repo's roster (`context/profile.json` `agentRoster`), replacing the
  package's `product-spec`/`architect`/`implementer`/specialist split
- `skills/closed-loop/*.md` — customized for the roster above, plus every
  other skill in `skills/` (unrelated to closed loop, purely local)
- `handoffs/schema.json` — carries this repo's extra `findings` field
- `pack/hygiene-rules.json` — this repo's own banned-substring list
- `orchestrator/` — this repo's own CI-ruleset-gated loop runner (diverged
  from the package's generic one; not fed back automatically)

**Never copied, never part of the package:**

- `app/` and any product code
- `context/` (write from the package's `pack/templates/context/`)
- `loop/learnings.md` (open questions only)
- Host git policy, remotes, trunk vs PR
- `CLAUDE.md` / `AGENTS.md` once customized

## Install into another repo

**Canonical steps and file tree:** [closed-loop-agents `pack/SETUP.md`](https://github.com/leeran7/closed-loop-agents/blob/main/pack/SETUP.md).

```bash
yarn add -D github:leeran7/closed-loop-agents#main
npx closed-loop-agents sync
```

`sync` reads the package's `agents/`/`skills/closed-loop/` as defaults; a
same-named file in **your** repo's own `agents/`/`skills/` overrides or
extends it. Set `context/profile.json` `agentRoster` to the exact agent
names you want if you don't want every generic role synced. Then edit
**your** `context/` — not the package's `agents/`.

Do **not** copy this repo's `loop/learnings.md` body or filled-in
`context/`. Other products inherit `skills/closed-loop/gates.md`, not
product memory.

## Runtime: how an agent sees the layers

1. **Cursor / Claude Code / Codex** — platform agent file = protocol (prepended by
   sync) + role body. Skills live under `skills/closed-loop/` (synced to each
   platform directory). The agent reads `context/` and the ledger.
2. **`yarn loop`** — `buildStagePrompt` wraps goal, **repo `context/`**,
   prior handoff, and learnings as untrusted data, then the role body.

Either path: missing handoff file → stage **failed**.

## Learnings → kernel (promotion)

| Kind | Lives in | Example |
|------|----------|---------|
| Product-specific | `context/conventions.md` | Auth effects gate on loading; canvas width clears bitmap |
| Kernel-generic | `skills/closed-loop/gates.md` | Prove a gate fails; never grep-assert behaviour |
| Role invariant | that agent's `## Hard rules` | Verifier does not fix production code |
| Auto-loaded rules | `.claude/rules/*.md` | Distilled gates for every conversation |

Learnings follow a **promote-then-prune** pipeline: the orchestrator retro
routes each finding to its permanent file (see `learning-loop.md`) and
prunes it. `loop/learnings.md` holds only open questions.

Do not paste kernel gates back into every agent. Point at `gates.md`. Keep each
`agents/` markdown file under 200 lines; split into `agents/<role>/*.md` partials
and reference them instead of growing the entry file.

## Quality gates in the profile

A gate that has never been shown to go red is not a gate (Aug 29: `next
lint` with no ESLint config exited 0). Each `context/gates.json`
`gates[]` entry should include `proveFail`: a command that must fail on a
known-bad input.

The verifier reads this list. Agents do not invent
`pnpm lint` because a template once said so.

## Hygiene

`yarn hygiene` (→ `closed-loop-agents hygiene`) fails if any agent in this
repo's own `agents/` contains product leakage (design hexes, this repo's
git remote, hardcoded exclusive package manager, the old design-resource
URL list) or exceeds **200 lines** — checked against this repo's own
`pack/hygiene-rules.json`, which exists specifically so this check runs
against *our* agents, not just the package's generic ones. `yarn sync` runs
hygiene against the package's own agents first (a package-integrity check),
then generates this repo's platform files.

### Agent file size

Each markdown file under `agents/` — entry files (`agents/<role>.md`) and
partials (`agents/<role>/*.md`) — must stay **under 200 lines**. When a role
outgrows that limit:

1. Keep `agents/<role>.md` as the entry point (YAML frontmatter + identity +
   pointers).
2. Move detailed checklists, examples, or domain sections into
   `agents/<role>/<topic>.md`.
3. Reference partials from the entry file and from each other with repo paths,
   e.g. `Read agents/verifier/coverage-matrix.md before writing tests.`

Do **not** paste partial contents back into the entry file at sync time. Agents
read the referenced files when the task needs that depth — same pattern as
`context/` and `skills/closed-loop/gates.md`.

Kernel-generic lessons belong in `gates.md` or the ledger, not in longer agent
files.

## Roster (unchanged jobs, slimmer files)

Required on a **whole-app** closed-loop run:

`software-engineer → verifier → reviewer +
security-reviewer → qa-acceptance → integrator`

The software-engineer owns spec, architecture, and all code directly.

Incremental work in an existing repo uses the host review classification
(substantial / minor / trivial) — not the eight-agent clamp. The clamp is
for `@orchestrator` / `yarn loop`.

## File map

| Path | Layer |
|------|--------|
| closed-loop-agents `pack/SETUP.md` | Install + file tree (start here) |
| `skills/closed-loop/protocol.md` | Kernel preamble (sync + `loadAgentPrompt` prepend) — local override |
| `skills/closed-loop/gates.md` | Universal quality gates — local override |
| `skills/closed-loop/profile.md` | `context/` contract — local override |
| `skills/closed-loop/handoffs.md` | Handoff JSON contract — local override |
| `skills/closed-loop/learning-loop.md` | Ledger protocol — local override |
| `skills/closed-loop/team.md` | Dispatch contract — local override |
| `skills/closed-loop/stages.md` | Stage graph — local override |
| `skills/closed-loop/host.md` | Generic CLAUDE/AGENTS body — local override |
| `agents/*.md` | This repo's roster (point at `context/`) — local override |
| `pack/hygiene-rules.json` | This repo's hygiene bans — local override |
| `context/` | This repo's facts |
| closed-loop-agents `pack/templates/context/` | Empty context for a new repo |
| closed-loop-agents `pack/profile.schema.json` | `context/profile.json` schema |
| `loop/learnings.md` | This product's memory |

