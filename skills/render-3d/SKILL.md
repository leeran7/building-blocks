---
name: render-3d
description: >-
  Generate Three.js/WebGL scene code from a plain-words prompt for client
  sites — hero sections, product visualizers — with a headless preview
  screenshot to verify it renders. Use when a build needs a 3D visual and
  when iterating on a scene's look from a text description.
---

# Render 3D

Plain words in, Three.js code out. Every generation is verified with a real
headless render before it is handed back.

## Purpose

Produce a self-contained Three.js ES module for a described visual, plus a
screenshot proving it renders without errors, plus a one-paragraph
integration snippet for the target stack.

## Workflow

1. Collect inputs: `prompt` (required), `placement` (`hero` | `product` |
   `background`, default `hero`), `style` (free text, optional),
   `budget` (`low` | `medium` | `high`, default `medium`).
2. Generate code. Prefer the CLI so the preview gate always runs:
   ```bash
   node skills/render-3d/bin/render-3d.mjs --prompt "..." --placement hero --out ./out
   ```
   This writes `scene.js`, `preview.png`, and `snippet.md` into `--out`.
   It exits non-zero if the headless render reports any JS error.
3. To re-render existing code without regenerating:
   ```bash
   node skills/render-3d/bin/preview-scene.mjs --code ./out/scene.js --out ./out/preview.png
   ```
4. Hand back the code, the preview screenshot, and the integration
   snippet. Never hand back code whose preview failed.

## Output contract

The generated module MUST:

- `import * as THREE from 'three'` (and `three/addons/` only if needed)
- declare top-level `export const scene` and `export const camera`
- be fully procedural — no external textures, models, fonts, or network
  fetches; everything is geometry + lights + materials
- run with zero console errors in the headless check

Placement defaults live in [references/threejs-patterns.md](references/threejs-patterns.md).
Prompt → code examples live in [references/examples.md](references/examples.md).

## Tooling

- `bin/render-3d.mjs` — prompt → code + preview + snippet (runs the gate)
- `bin/preview-scene.mjs` — code → screenshot + error check
- `lib/` — pluggable model backend (`RENDER_3D_BACKEND`), scene scaffold,
  headless Chrome CDP client
- `mcp-server/` — the same capability as an MCP server for Claude Code:
  `claude mcp add render-3d -- node <repo>/skills/render-3d/mcp-server/server.mjs`.
  Tools: `render-scene`, `preview-scene`. See `mcp-server/README.md`.

## Auth

Code generation calls a model backend. No key is ever written to the repo.

- `RENDER_3D_BACKEND=openai` (default when `OPENAI_API_KEY` is set) —
  reads `OPENAI_API_KEY`; `RENDER_3D_MODEL` and `RENDER_3D_BASE_URL`
  optional overrides (any OpenAI-compatible endpoint works).
- `RENDER_3D_BACKEND=stub` — deterministic offline scene for tests and
  demos. Forced automatically when no key is configured.

## Operating Rules

1. Never present un-previewed code as finished. The preview gate is the
   definition of done for a generation.
2. Keep generations self-contained and offline-safe (rule above). If a
   design truly needs an external asset, say so instead of silently
   fetching it.
3. Respect the performance budget: `low` ≤ 50k triangles, no
   post-processing; `medium` ≤ 200k; `high` ≤ 500k with one pass max.
4. The model backend is behind `lib/backend.mjs`. Model tiering /
   routing across providers is one-body issue #8's job (leeran7/one-body#8) — do not hard-code provider
   logic into the skill.
5. Chrome is resolved via `RENDER_3D_CHROME_BIN`, then well-known paths.
   If no Chrome is found, `preview-scene` fails loudly — never fake a
   preview.

## Security

Generated scene code is untrusted input. The skill treats it that way:

- The harness HTML is injected via `Page.setDocumentContent` — no local
  server, no `file://` access, no `--allow-file-access-from-files`. The
  pinned three.js build is inlined as a hash-verified `data:` URL in the
  import map, so the page needs no network to render.
- `--no-sandbox` is only added when `RENDER_3D_NO_SANDBOX=1` or running as
  root (containers); remote-debugging binds to `127.0.0.1` only.
- The pinned three.js build is SHA-512-verified on download and cache hit.
- `width`/`height` are coerced to integers and clamped (16–4096) before
  being interpolated into page JS; generated code is capped at 2 MB.
- The harness sets a Content-Security-Policy with `connect-src 'none'`:
  generated code cannot phone home; the page needs no network to render.
- The MCP server confines `outDir`/`outPath` under `RENDER_3D_OUT_BASE`
  (default `./render-3d-out`), drops stdin messages over 32 MB, and never
  executes notification-form `tools/call` (no `id` = no request).
- `OPENAI_API_KEY` is env-only and never logged or persisted.

Threat-model note: `three/addons/` in the import map still resolves to the
pinned jsdelivr CDN (not hash-verified). Only code that imports addons
touches it; the core `three` module served to the harness is verified.
