// Tests for the codex backend against a fake CLI. Run: node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = join(ROOT, "test/fixtures/fake-codex.mjs");
const { createBackend } = await import(join(ROOT, "lib/backend.mjs"));
const stub = await import(join(ROOT, "lib/backends/stub.mjs"));

const REQ = { prompt: "obsidian tower over a lava river", placement: "hero", style: "", budget: "low" };

async function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("factory returns the codex backend only when named", async () => {
  await withEnv({ RENDER_3D_BACKEND: "codex", OPENAI_API_KEY: undefined }, async () => {
    assert.equal((await createBackend()).name, "codex");
  });
  await withEnv({ RENDER_3D_BACKEND: undefined, OPENAI_API_KEY: undefined }, async () => {
    assert.equal((await createBackend()).name, "stub");
  });
});

test("codex backend returns contract-valid code and sends a sandboxed, stdin prompt", async () => {
  const backend = await createBackend("codex");
  const { code: expected } = await stub.generateSceneCode(REQ);
  const log = join(await mkdtemp(join(tmpdir(), "r3d-fake-")), "log.json");
  const { code } = await withEnv(
    { RENDER_3D_CODEX_BIN: FAKE, FAKE_CODEX_MODE: "ok", FAKE_CODEX_CODE: expected,
      FAKE_CODEX_LOG: log, RENDER_3D_MODEL: "gpt-test" },
    () => backend.generateSceneCode(REQ)
  );
  assert.equal(code, expected.trim(), "fences were not stripped");
  const seen = JSON.parse(await readFile(log, "utf8"));
  assert.match(seen.stdin, /obsidian tower over a lava river/);
  assert.match(seen.stdin, /export const scene/); // system prompt included
  assert.equal(seen.args.at(-1), "-");
  assert.equal(seen.args[seen.args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(seen.args[seen.args.indexOf("-m") + 1], "gpt-test");
  assert.ok(seen.args.includes("--ignore-user-config"));
  const disabled = seen.args.filter((a, i) => seen.args[i - 1] === "--disable");
  for (const f of ["shell_tool", "unified_exec", "browser_use", "computer_use"]) {
    assert.ok(disabled.includes(f), `${f} left enabled`);
  }
  // Runs in a throwaway dir, not the repo, and cleans it up.
  assert.ok(seen.cwd.includes("render-3d-codex-"), `cwd was ${seen.cwd}`);
  await assert.rejects(stat(seen.cwd), { code: "ENOENT" });
});

test("codex backend rejects output that breaks the scene contract", async () => {
  const backend = await createBackend("codex");
  await withEnv({ RENDER_3D_CODEX_BIN: FAKE, FAKE_CODEX_MODE: "bad" }, async () => {
    await assert.rejects(backend.generateSceneCode(REQ), /failed contract/);
  });
});

test("codex backend surfaces a login hint when the CLI is signed out", async () => {
  const backend = await createBackend("codex");
  await withEnv({ RENDER_3D_CODEX_BIN: FAKE, FAKE_CODEX_MODE: "unauth" }, async () => {
    await assert.rejects(backend.generateSceneCode(REQ), /exit 1\. Run `codex login` first/);
  });
});

test("codex backend explains a missing CLI", async () => {
  const backend = await createBackend("codex");
  await withEnv({ RENDER_3D_CODEX_BIN: join(ROOT, "no-such-codex-bin") }, async () => {
    await assert.rejects(backend.generateSceneCode(REQ), /was not found/);
  });
});
