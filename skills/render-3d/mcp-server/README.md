# render-3d MCP server

The `render-3d` skill as an MCP server for Claude Code. Dependency-free:
plain JSON-RPC over stdio, no SDK.

## Add it

```bash
# from the closed-loop-agents repo (or wherever you installed it)
claude mcp add render-3d -- node ./skills/render-3d/mcp-server/server.mjs

# force the deterministic offline backend
claude mcp add render-3d-stub -e RENDER_3D_BACKEND=stub -- node ./skills/render-3d/mcp-server/server.mjs

# use a real model backend
claude mcp add render-3d -e OPENAI_API_KEY="$OPENAI_API_KEY" -- node ./skills/render-3d/mcp-server/server.mjs
```

Or drop it in `.mcp.json`:

```json
{
  "mcpServers": {
    "render-3d": {
      "command": "node",
      "args": ["./skills/render-3d/mcp-server/server.mjs"],
      "env": { "RENDER_3D_BACKEND": "stub" }
    }
  }
}
```

## Tools

- `render-scene` — prompt → Three.js module + verified preview screenshot.
  Inputs: `prompt` (required), `placement`, `style`, `budget`, `outDir`,
  `width`, `height`.
- `preview-scene` — render existing scene code (`code`, or `codePath` under
  `RENDER_3D_OUT_BASE`) and
  get a screenshot path. Errors if the code throws or breaks the contract.

## Env

| Var | Notes |
|---|---|
| `RENDER_3D_BACKEND` | `openai`, `codex` or `stub` (auto: openai when `OPENAI_API_KEY` is set, else stub) |
| `RENDER_3D_CODEX_BIN` | Codex CLI binary for the `codex` backend (default `codex`) |
| `OPENAI_API_KEY` | model backend key (never committed) |
| `RENDER_3D_MODEL` / `RENDER_3D_BASE_URL` | model / endpoint overrides |
| `RENDER_3D_CHROME_BIN` | Chrome binary for the preview gate |
| `RENDER_3D_CACHE_DIR` | where the pinned three.js build is cached |
| `RENDER_3D_OUT_BASE` | base dir all tool output paths are confined under (default `./render-3d-out`) |
| `RENDER_3D_NO_SANDBOX` | set `1` to add Chrome `--no-sandbox` (containers only) |

## Smoke test

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node server.mjs
```
