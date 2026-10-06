// chrome.mjs — minimal headless-Chrome renderer over raw CDP (no puppeteer).
//
// Security model: the harness runs model-generated JavaScript, which is
// UNTRUSTED input. The renderer therefore:
//   - injects the harness via Page.setDocumentContent — no local http
//     server, no file:// access, no --allow-file-access-from-files, and no
//     navigation for the page to abuse,
//   - inlines the pinned three.js build as a data: URL in the import map
//     (bytes are SHA-512-verified on download and on cache hit),
//   - pins --remote-debugging-address to 127.0.0.1,
//   - only adds --no-sandbox when explicitly requested via
//     RENDER_3D_NO_SANDBOX=1 or when running as root (containers),
//   - coerces + clamps width/height (they are interpolated into page JS),
//   - caps generated-code size.
import { spawn } from "node:child_process";
import { createServer } from "node:http"; // freePort() only — no page server
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessSync } from "node:fs";
import { access, constants, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

export const THREE_VERSION = "0.170.0";
// SHA-512 of build/three.module.js from the three@0.170.0 npm tarball
// (verified byte-identical to the jsdelivr copy). Bump with the version.
export const THREE_SHA512 =
  "f5144b2b73ad334a135690db98764ad9275044132af76cfb13edab0ec3ae1dc86ed43d1d241fe7d03640d6a5d688f8169dcb5d39c695a650be5fd1186ccf1441";
const THREE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`;
const ADDONS_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/`;

const DIM_MIN = 16;
const DIM_MAX = 4096;
export const MAX_CODE_BYTES = 2_000_000;

/** Coerce a dimension to a finite integer and clamp it to a sane range. */
export function sanitizeDim(value, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(DIM_MAX, Math.max(DIM_MIN, n));
}

export function assertCodeSize(code) {
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > MAX_CODE_BYTES) {
    throw new Error(`code too large: ${bytes} bytes > ${MAX_CODE_BYTES} byte limit`);
  }
}

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

function cacheDir() {
  return process.env.RENDER_3D_CACHE_DIR || join(homedir(), ".cache", "render-3d");
}

async function sha512File(path) {
  const data = await readFile(path);
  return createHash("sha512").update(data).digest("hex");
}

/** Download the pinned three.js build, verifying its hash. Verifies cache hits too. */
export async function ensureThreeJs() {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  const dest = join(dir, `three.module-${THREE_VERSION}.js`);
  if (await exists(dest)) {
    const digest = await sha512File(dest);
    if (digest === THREE_SHA512) return dest;
    // Cache poisoned or stale — re-download below.
  }
  const res = await fetch(THREE_URL);
  if (!res.ok) throw new Error(`three.js download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const digest = createHash("sha512").update(buf).digest("hex");
  if (digest !== THREE_SHA512) {
    throw new Error("three.js download failed integrity check — refusing to use it");
  }
  await writeFile(dest, buf);
  return dest;
}

/**
 * Build the harness HTML. Generated code is base64-encoded into the page
 * and imported as a blob: module inside try/catch — raw code never reaches
 * the HTML parser, so </script> breakouts are structurally impossible
 * (this cannot mitigate intentional code execution — running the code IS
 * the harness's purpose).
 *
 * three.js is inlined as a base64 data: URL in the import map (the bytes
 * are the hash-verified pinned build from ensureThreeJs), so the harness
 * needs no network and no local server to render.
 */
export function buildHarness(code, { threeDataUrl, addonsUrl, width, height }) {
  const w = sanitizeDim(width, 1280);
  const h = sanitizeDim(height, 800);
  // Generated code travels as base64 and is imported as a blob module inside
  // try/catch. Raw code never touches the HTML parser (no </script> breakout
  // possible), and even top-level throws surface with their message instead
  // of killing the module before the harness can report.
  const codeB64 = Buffer.from(code, "utf8").toString("base64");
  // Generated code is untrusted: block all network exfiltration. three.js
  // itself is inlined (data:), so rendering needs no network.
  const csp = "script-src 'unsafe-inline' data: blob: https://cdn.jsdelivr.net; " +
    "connect-src 'none'; img-src data: blob:; media-src data: blob:; " +
    "style-src 'unsafe-inline'; font-src data:; object-src 'none'; " +
    "base-uri 'none'; form-action 'none'; worker-src 'none';";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<script type="importmap">{"imports":{"three":"${threeDataUrl}","three/addons/":"${addonsUrl}"}}</script>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#000}</style>
</head><body>
<script type="module">
;(async () => {
  try {
    const src = atob("${codeB64}");
    const mod = await import(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    const { scene, camera } = mod;
    if (!scene) throw new Error('missing export \`scene\`');
    if (!camera) throw new Error('missing export \`camera\`');
    // Match the camera to the actual capture size, not whatever the
    // generator assumed.
    if (camera.isPerspectiveCamera && Number.isFinite(camera.aspect)) {
      const want = ${w} / ${h};
      if (Math.abs(camera.aspect - want) > 1e-6) {
        camera.aspect = want;
        camera.updateProjectionMatrix();
      }
    }
    let renderer;
    if (typeof mod.createRenderer === 'function') {
      renderer = mod.createRenderer();
    } else {
      const THREE = await import('three');
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(${w}, ${h});
      document.body.appendChild(renderer.domElement);
    }
    if (typeof mod.animate === 'function') {
      // Let one frame run, then capture deterministically.
      mod.animate(renderer, scene, camera);
      await new Promise(r => setTimeout(r, 700));
    } else if (typeof mod.renderFrame === 'function') {
      mod.renderFrame(renderer, scene, camera);
    } else {
      renderer.render(scene, camera);
      await new Promise(r => setTimeout(r, 300));
    }
    window.__render3d = { ok: true };
  } catch (e) {
    window.__render3d = { ok: false, error: String((e && e.stack) || e) };
  }
})();
</script>
</body></html>`;
}

export function resolveChromeBin() {
  if (process.env.RENDER_3D_CHROME_BIN) {
    const p = process.env.RENDER_3D_CHROME_BIN;
    try {
      accessSync(p, constants.X_OK);
    } catch {
      throw new Error(`RENDER_3D_CHROME_BIN is not executable: ${p}`);
    }
    return p;
  }
  const candidates = [
    "/opt/meta-chromium/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const c of candidates) {
    try {
      accessSync(c);
      return c;
    } catch { /* next */ }
  }
  throw new Error(
    "no Chrome/Chromium binary found — set RENDER_3D_CHROME_BIN to its path"
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function needsNoSandbox() {
  if (process.env.RENDER_3D_NO_SANDBOX === "1") return true;
  // Chromium cannot sandbox when running as root (typical in containers).
  try { return process.geteuid?.() === 0; } catch { return false; }
}

function launchChromeProcess(debugPort) {
  const bin = resolveChromeBin();
  const profileDir = join(tmpdir(), `render-3d-profile-${process.pid}-${Date.now()}`);
  const args = [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    "--disable-gpu",
    // Chrome 137+ no longer falls back to SwiftShader for WebGL on its own,
    // so GPU-less hosts (CI, containers) fail with "Error creating WebGL
    // context". Ask ANGLE for SwiftShader explicitly.
    "--use-angle=swiftshader",
    "--hide-scrollbars",
    "--mute-audio",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ];
  if (needsNoSandbox()) args.push("--no-sandbox");
  const child = spawn(bin, args, { stdio: "ignore" });
  child.on("error", (e) => {
    // Don't swallow: a bad binary should fail fast with a clear cause.
    child.__spawnError = e;
  });
  return { child, profileDir };
}

async function waitForDebugger(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timed out waiting for Chrome remote debugging endpoint");
}

/** Minimal CDP client over the raw WebSocket protocol. */
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    // Lazy-require ws-free: implement the tiny slice of RFC6455 we need.
    // To avoid a dependency, shell to node:crypto for the handshake and
    // speak raw frames over a TCP socket.
    import("node:net").then(({ connect }) => {
      import("node:crypto").then(({ randomBytes, createHash }) => {
        const u = new URL(wsUrl);
        const key = randomBytes(16).toString("base64");
        const socket = connect({ host: u.hostname, port: Number(u.port) }, () => {
          const req =
            `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
            `Host: ${u.hostname}:${u.port}\r\n` +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Key: ${key}\r\n` +
            "Sec-WebSocket-Version: 13\r\n\r\n";
          socket.write(req);
        });
        let buffer = Buffer.alloc(0);
        let id = 0;
        const pending = new Map();
        const listeners = new Map();
        const api = {
          // In flattened mode the sessionId rides top-level, NOT in params.
          send(method, params = {}, sessionId) {
            return new Promise((res, rej) => {
              const cur = ++id;
              pending.set(cur, { res, rej });
              const msg = { id: cur, method, params };
              if (sessionId) msg.sessionId = sessionId;
              const payload = Buffer.from(JSON.stringify(msg));
              // RFC6455 client frame: FIN+text opcode, MASK bit set, then a
              // 4-byte masking key (zeros: legal, keeps the code tiny), then
              // the masked payload.
              let header;
              if (payload.length < 126) {
                header = Buffer.from([0x81, 0x80 | payload.length]);
              } else if (payload.length < 65536) {
                header = Buffer.alloc(4);
                header[0] = 0x81; header[1] = 0x80 | 126;
                header.writeUInt16BE(payload.length, 2);
              } else {
                // setDocumentContent carries the whole inlined page (~2MB).
                header = Buffer.alloc(10);
                header[0] = 0x81; header[1] = 0x80 | 127;
                header.writeBigUInt64BE(BigInt(payload.length), 2);
              }
              const frame = Buffer.concat([
                header,
                Buffer.alloc(4), // zero masking key
                payload,         // XOR with zeros = identity
              ]);
              socket.write(frame);
            });
          },
          on(event, fn) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(fn);
          },
          close() { socket.destroy(); },
        };
        let handshook = false;
        socket.on("data", (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (!handshook) {
            const idx = buffer.indexOf("\r\n\r\n");
            if (idx === -1) return;
            const head = buffer.slice(0, idx).toString();
            if (!head.includes("101")) {
              reject(new Error("WebSocket handshake failed"));
              socket.destroy();
              return;
            }
            handshook = true;
            buffer = buffer.slice(idx + 4);
            resolve(api);
            return;
          }
          while (buffer.length >= 2) {
            const opcode = buffer[0] & 0x0f;
            let len = buffer[1] & 0x7f;
            let off = 2;
            if (len === 126) { len = buffer.readUInt16BE(2); off = 4; }
            else if (len === 127) { len = Number(buffer.readBigUInt64BE(2)); off = 10; }
            if (buffer.length < off + len) break;
            const payload = buffer.slice(off, off + len);
            buffer = buffer.slice(off + len);
            if (opcode === 0x8) { socket.destroy(); return; }
            if (opcode !== 0x1) continue;
            let msg;
            try { msg = JSON.parse(payload.toString()); } catch { continue; }
            if (msg.id && pending.has(msg.id)) {
              const { res, rej } = pending.get(msg.id);
              pending.delete(msg.id);
              if (msg.error) rej(new Error(`CDP: ${msg.error.message || JSON.stringify(msg.error)}`));
              else res(msg.result);
            } else if (msg.method) {
              for (const fn of listeners.get(msg.method) || []) fn(msg.params);
            }
          }
        });
        socket.on("error", reject);
      });
    });
  });
}

/**
 * Render the scene headlessly and screenshot it. The harness HTML (with the
 * hash-verified three.js build inlined as a data: URL) is injected via
 * Page.setDocumentContent — no local server, no file://, no navigation, so
 * there is nothing on the loopback interface for the page to reach and no
 * proxy involved. Returns { ok, previewPath } or { ok:false, error }.
 */
export async function preview(code, { width = 1280, height = 800, outPath } = {}) {
  assertCodeSize(code);
  const w = sanitizeDim(width, 1280);
  const h = sanitizeDim(height, 800);
  const threePath = await ensureThreeJs();
  const threeDataUrl =
    "data:text/javascript;base64," +
    (await readFile(threePath)).toString("base64");

  const html = buildHarness(code, {
    threeDataUrl,
    addonsUrl: ADDONS_URL,
    width: w,
    height: h,
  });

  const debugPort = await freePort();
  const { child, profileDir } = launchChromeProcess(debugPort);
  // Fail fast on a bad binary instead of timing out at the debugger poll.
  await new Promise((r) => setTimeout(r, 500));
  if (child.__spawnError) {
    child.kill("SIGKILL");
    throw new Error(`failed to launch Chrome: ${child.__spawnError.message}`);
  }
  try {
    const version = await waitForDebugger(debugPort);
    const cdp = await cdpConnect(version.webSocketDebuggerUrl);
    try {
      // Every CDP call — including target setup — gets a timeout. A Chrome
      // that accepts the socket then stalls must not wedge preview() (or the
      // sequential MCP server loop) forever.
      const sendRaw = (method, params = {}, ms = 20000) =>
        Promise.race([
          cdp.send(method, params),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`CDP timeout: ${method}`)), ms)
          ),
        ]);
      const { targetId } = await sendRaw("Target.createTarget", {
        url: "about:blank",
      });
      const { sessionId } = await sendRaw("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      // No single CDP call may hang the preview indefinitely.
      const send = (method, params = {}, ms = 20000) =>
        Promise.race([
          cdp.send(method, params, sessionId),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`CDP timeout: ${method}`)), ms)
          ),
        ]);

      await send("Page.enable");
      await send("Runtime.enable");
      await send("Emulation.setDeviceMetricsOverride", {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile: false,
      });

      const errors = [];
      cdp.on("Runtime.exceptionThrown", (p) => {
        const d = p.exceptionDetails;
        errors.push(d?.exception?.description || d?.text || "exception");
      });
      cdp.on("Log.entryAdded", (p) => {
        if (p.entry?.level === "error") errors.push(p.entry.text);
      });
      await send("Log.enable");

      const loaded = new Promise((res) => {
        cdp.on("Page.loadEventFired", () => res());
      });
      const { frameTree } = await send("Page.getFrameTree");
      await send("Page.setDocumentContent", {
        frameId: frameTree.frame.id,
        html,
      }, 60000);
      await Promise.race([
        loaded,
        new Promise((r) => setTimeout(r, 10000)),
      ]);
      // Give the module + one animation frame time to settle.
      await new Promise((r) => setTimeout(r, 1200));

      const evaled = await send("Runtime.evaluate", {
        expression: "window.__render3d || { ok: false, error: 'no status reported' }",
        returnByValue: true,
      });
      const status = evaled.result?.value || { ok: false, error: "no result" };
      if (process.env.RENDER_3D_DEBUG === "1") {
        const loc = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true }).catch(() => null);
        const rs = await send("Runtime.evaluate", { expression: "document.readyState + ' len=' + document.documentElement.outerHTML.length", returnByValue: true }).catch(() => null);
        console.error(`[render-3d] status=${JSON.stringify(status)} errors=${JSON.stringify(errors)} href=${JSON.stringify(loc?.result?.value)} ready=${JSON.stringify(rs?.result?.value)}`);
      }
      if (!status.ok || errors.length > 0) {
        const detail = [status.error, ...errors].filter(Boolean).join(" | ").slice(0, 2000);
        return { ok: false, error: detail || "render failed" };
      }

      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const dest =
        outPath ||
        join(tmpdir(), `render-3d-preview-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`);
      await writeFile(dest, Buffer.from(data, "base64"));
      return { ok: true, previewPath: dest };
    } finally {
      cdp.close();
    }
  } finally {
    child.kill("SIGKILL");
    // Don't leak a Chrome profile dir per preview.
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}
