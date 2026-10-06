// Tests for the render-3d skill. Run: node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { mulberry32, hashSeed, validateContract } = await import(
  join(ROOT, "lib/scaffold.mjs")
);
const stub = await import(join(ROOT, "lib/backends/stub.mjs"));
const { createBackend } = await import(join(ROOT, "lib/backend.mjs"));
const { renderScene } = await import(join(ROOT, "lib/render.mjs"));

test("mulberry32 is deterministic", () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test("stub backend is deterministic per prompt", async () => {
  const req = { prompt: "floating cubes at sunset", placement: "hero", style: "", budget: "medium" };
  const r1 = await stub.generateSceneCode(req);
  const r2 = await stub.generateSceneCode(req);
  assert.equal(r1.code, r2.code);
  const r3 = await stub.generateSceneCode({ ...req, prompt: "underwater coral reef" });
  assert.notEqual(r1.code, r3.code);
});

test("stub output honors the module contract", async () => {
  const { code } = await stub.generateSceneCode({
    prompt: "x", placement: "product", style: "", budget: "low",
  });
  const check = validateContract(code);
  assert.deepEqual(check.errors, []);
  assert.ok(check.ok);
});

test("validateContract rejects missing exports and banned patterns", () => {
  const missing = validateContract(`import * as THREE from 'three';\nexport const scene = 1;`);
  assert.ok(!missing.ok);
  assert.match(missing.errors.join(" "), /camera/);

  const banned = validateContract(
    `import * as THREE from 'three';\nexport const scene = 1;\nexport const camera = 2;\nfetch('https://x');`
  );
  assert.ok(!banned.ok);
  assert.match(banned.errors.join(" "), /banned/);
});

test("backend factory defaults to stub without a key", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.RENDER_3D_BACKEND;
  const b = await createBackend();
  assert.equal(b.name, "stub");
});

test("openai backend fails loudly without a key", async () => {
  delete process.env.OPENAI_API_KEY;
  const b = await createBackend("openai");
  await assert.rejects(
    () => b.generateSceneCode({ prompt: "x", placement: "hero", style: "", budget: "medium" }),
    /OPENAI_API_KEY/
  );
});

test("renderScene writes scene + snippet without preview", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "r3d-"));
  const summary = await renderScene({
    prompt: "test scene",
    placement: "hero",
    budget: "low",
    outDir,
    doPreview: false,
    backend: "stub",
  });
  assert.ok(summary.ok);
  assert.equal(summary.preview, null);
  await stat(join(outDir, "scene.js"));
  await stat(join(outDir, "snippet.md"));
  const snippet = await readFile(join(outDir, "snippet.md"), "utf8");
  assert.match(snippet, /Hero3D/);
});

// --- Chrome-dependent tests: skip gracefully when no browser is available ---
let chromeBin = null;
try {
  const chrome = await import(join(ROOT, "lib/chrome.mjs"));
  chromeBin = await chrome.resolveChromeBin();
} catch { /* leave null -> skip */ }

const it = chromeBin ? test : test.skip;

it("preview gate passes on valid stub code", async () => {
  const chrome = await import(join(ROOT, "lib/chrome.mjs"));
  const { code } = await stub.generateSceneCode({
    prompt: "preview me", placement: "hero", style: "", budget: "low",
  });
  const outDir = await mkdtemp(join(tmpdir(), "r3d-"));
  const outPath = join(outDir, "preview.png");
  const result = await chrome.preview(code, { width: 640, height: 400, outPath });
  assert.ok(result.ok, `preview failed: ${result.error}`);
  const st = await stat(outPath);
  assert.ok(st.size > 1000, "screenshot suspiciously small");
}, { timeout: 60000 });

it("preview gate FAILS on broken code (gate-fails proof)", async () => {
  const chrome = await import(join(ROOT, "lib/chrome.mjs"));
  const broken = `import * as THREE from 'three';
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
throw new Error('deliberate boom');`;
  const result = await chrome.preview(broken, { width: 320, height: 200 });
  assert.ok(!result.ok, "broken code should fail the preview gate");
  assert.match(result.error, /deliberate boom/);
}, { timeout: 60000 });

// A scene that takes a few seconds to build (big procedural terrain) must
// still pass: the gate waits for the harness to report, up to
// RENDER_3D_SETTLE_MS, instead of a fixed settle time.
const SLOW_SCENE = `import * as THREE from 'three';
const until = Date.now() + 3000;
while (Date.now() < until) {} // stand-in for a slow scene build
export const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1));
export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);`;

it("preview gate waits for a slow scene to report", async () => {
  const chrome = await import(join(ROOT, "lib/chrome.mjs"));
  const result = await chrome.preview(SLOW_SCENE, { width: 320, height: 200 });
  assert.ok(result.ok, `slow scene failed the gate: ${result.error}`);
}, { timeout: 90000 });

it("preview gate gives up on a scene that never reports", async () => {
  const chrome = await import(join(ROOT, "lib/chrome.mjs"));
  const hung = `import * as THREE from 'three';
await new Promise(() => {}); // never finishes building
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);`;
  const saved = process.env.RENDER_3D_SETTLE_MS;
  process.env.RENDER_3D_SETTLE_MS = "1500";
  try {
    const started = Date.now();
    const result = await chrome.preview(hung, { width: 320, height: 200 });
    assert.ok(!result.ok, "a scene that never reports should fail");
    assert.match(result.error, /no status reported within 1500 ms/);
    assert.ok(Date.now() - started < 30000, "gate did not honour RENDER_3D_SETTLE_MS");
  } finally {
    if (saved === undefined) delete process.env.RENDER_3D_SETTLE_MS;
    else process.env.RENDER_3D_SETTLE_MS = saved;
  }
}, { timeout: 90000 });

it("MCP server: initialize, tools/list, render-scene call", async () => {
  const serverPath = join(ROOT, "mcp-server/server.mjs");
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      RENDER_3D_BACKEND: "stub",
      RENDER_3D_OUT_BASE: tmpdir(), // confine outputs under tmp for the test
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const outDir = await mkdtemp(join(tmpdir(), "r3d-mcp-"));
  const responses = new Map();
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) responses.set(msg.id, msg);
      } catch { /* ignore */ }
    }
  });
  const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
  const waitFor = async (id, ms = 90000) => {
    const start = Date.now();
    while (!responses.has(id)) {
      if (Date.now() - start > ms) throw new Error(`no response to ${id}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    return responses.get(id);
  };

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    const init = await waitFor(1);
    assert.equal(init.result.serverInfo.name, "render-3d");

    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const list = await waitFor(2);
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["preview-scene", "render-scene"]);

    send({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: {
        name: "render-scene",
        arguments: {
          prompt: "mcp e2e", placement: "hero", budget: "low",
          outDir, width: 320, height: 200,
        },
      },
    });
    const called = await waitFor(3);
    assert.ok(!called.result.isError, `tool error: ${called.result.content?.[0]?.text}`);
    const summary = JSON.parse(called.result.content[0].text);
    assert.ok(summary.ok);
    assert.match(summary.code, /export const scene/);
    await stat(join(outDir, "preview.png"));
  } finally {
    child.kill("SIGKILL");
  }
}, { timeout: 120000 });
