# 3D Rendering Skill — Spec

Source: leeran7/one-body issue #4 (scope/spec). Recommended direction confirmed: a
**code-generation skill** producing Three.js/WebGL scene code for client
sites, plus headless preview screenshots. Ruled out: Blender automation,
AI image-gen of 3D-style renders.

## Why code generation

- Deterministic and editable — the client owns the asset, not a PNG.
- Fits the React/Next.js stack (drop the module into a component).
- Verifiable: a headless render either succeeds with zero errors or it
  does not. No aesthetic hand-waving.

## Inputs

| Input | Required | Notes |
|---|---|---|
| `prompt` | yes | Plain-words visual description |
| `placement` | no | `hero` \| `product` \| `background` (default `hero`) |
| `style` | no | Free-text constraints ("dark, neon accents") |
| `budget` | no | `low` \| `medium` \| `high` (default `medium`) |

## Outputs

1. `scene.js` — self-contained Three.js ES module (contract in SKILL.md).
2. `preview.png` — headless screenshot, 1280×800 default.
3. `snippet.md` — integration snippet (React component skeleton + notes).

## Model backend

Pluggable behind `lib/backend.mjs` (`ModelBackend` interface:
`generateSceneCode({prompt, placement, style, budget}) → {code}`).
leeran7/one-body#8 owns provider routing/tiering. This skill ships with:

- `openai` — OpenAI-compatible chat completions (`OPENAI_API_KEY`,
  optional `RENDER_3D_MODEL` / `RENDER_3D_BASE_URL`).
- `stub` — deterministic offline scene; used by tests and when no key
  is configured.

## Acceptance

- A one-line prompt produces a valid scene module.
- `preview-scene` renders it headlessly with zero JS errors.
- `render-3d` exits non-zero on any render error (gate is enforced, not
  advisory).
- `mcp-server` exposes `render-scene` and `preview-scene` over MCP stdio
  and passes a protocol smoke test.
