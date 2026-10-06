#!/usr/bin/env node
// render-3d as an MCP server over stdio (no SDK dependency).
// Add it with:
//   claude mcp add render-3d -- node /path/to/skills/render-3d/mcp-server/server.mjs
// With env passthrough, e.g.:
//   claude mcp add render-3d -e RENDER_3D_BACKEND=stub -- node /path/to/skills/render-3d/mcp-server/server.mjs
import { createInterface } from "node:readline";
import { renderScene, resolveConfined } from "../lib/render.mjs";
import { validateContract } from "../lib/scaffold.mjs";
import { preview, sanitizeDim } from "../lib/chrome.mjs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SERVER_INFO = { name: "render-3d", version: "1.0.0" };
const PROTOCOL_VERSION = "2024-11-05";

// Trust boundary: tool arguments can be influenced by untrusted content
// (prompt injection). All output paths are confined under OUT_BASE.
const OUT_BASE = process.env.RENDER_3D_OUT_BASE || resolve("./render-3d-out");

const TOOLS = [
  {
    name: "render-scene",
    description:
      "Generate a Three.js scene module from a plain-words prompt, verify it " +
      "with a headless render, and return the code plus a preview screenshot path.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Plain-words visual description" },
        placement: {
          type: "string",
          enum: ["hero", "product", "background"],
          description: "Where the visual lives on the page",
        },
        style: { type: "string", description: "Free-text style constraints" },
        budget: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Performance budget (triangle cap)",
        },
        outDir: { type: "string", description: "Output directory (created if missing)" },
        width: { type: "integer", description: "Preview width" },
        height: { type: "integer", description: "Preview height" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "preview-scene",
    description:
      "Headlessly render existing Three.js scene-module code and return a " +
      "screenshot path. Fails if the code has JS errors or breaks the contract.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Scene module source" },
        codePath: {
          type: "string",
          description: "Path to a scene module file (alternative to code)",
        },
        width: { type: "integer" },
        height: { type: "integer" },
        outPath: { type: "string", description: "Where to write the PNG" },
      },
    },
  },
];

function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

async function callTool(name, args = {}) {
  if (name === "render-scene") {
    const summary = await renderScene({
      prompt: args.prompt,
      placement: args.placement || "hero",
      style: args.style || "",
      budget: args.budget || "medium",
      outDir: resolveConfined(OUT_BASE, args.outDir || "."),
      width: sanitizeDim(args.width, 1280),
      height: sanitizeDim(args.height, 800),
      doPreview: true,
    });
    return textResult(JSON.stringify(summary, null, 2));
  }
  if (name === "preview-scene") {
    const code = args.code ?? (args.codePath ? await readFile(resolve(args.codePath), "utf8") : null);
    if (!code) throw new Error("preview-scene needs code or codePath");
    const contract = validateContract(code);
    if (!contract.ok) throw new Error(`contract failed: ${contract.errors.join("; ")}`);
    const result = await preview(code, {
      width: sanitizeDim(args.width, 1280),
      height: sanitizeDim(args.height, 800),
      outPath: args.outPath ? resolveConfined(OUT_BASE, args.outPath) : undefined,
    });
    if (!result.ok) throw new Error(`preview FAILED: ${result.error}`);
    return textResult(JSON.stringify({ ok: true, preview: result.previewPath }));
  }
  throw new Error(`unknown tool "${name}"`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const errReply = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        try {
          return reply(await callTool(params?.name, params?.arguments));
        } catch (e) {
          return reply(textResult(`error: ${e.message}`, true));
        }
      }
      default:
        if (method?.startsWith("notifications/")) return null; // no reply
        return errReply(-32601, `method not found: ${method}`);
    }
  } catch (e) {
    return errReply(-32603, e.message);
  }
}

async function main() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    // Bound memory: a single JSON-RPC message (even one carrying generated
    // scene code) has no business exceeding 32MB on stdin.
    if (line.length > 32 * 1024 * 1024) {
      process.stderr.write("mcp server: oversize message dropped\n");
      continue;
    }
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore malformed input
    }
    const isNotification = msg.id === undefined || msg.id === null;
    // Per JSON-RPC/MCP, a notification is not a request: never execute tool
    // semantics for one (no Chrome spawn, no billed model calls).
    if (isNotification) continue;
    const res = await handle(msg);
    if (res) {
      process.stdout.write(JSON.stringify(res) + "\n");
    }
  }
}

main().catch((e) => {
  process.stderr.write(`mcp server fatal: ${e.message}\n`);
  process.exit(1);
});
