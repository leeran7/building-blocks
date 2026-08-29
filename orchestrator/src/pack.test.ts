import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AGENTS_DIR, REPO_ROOT } from "./types.js";

describe("pack hygiene", () => {
  it("every role file points at context/README.md and leaks no product facts", async () => {
    const rules = JSON.parse(
      await readFile(join(REPO_ROOT, "pack", "hygiene-rules.json"), "utf-8"),
    ) as {
      bannedSubstrings: string[];
      requiredSubstrings: string[];
    };
    const files = (await readdir(AGENTS_DIR)).filter((file) => file.endsWith(".md"));
    assert.ok(files.length >= 20, `expected a full roster, got ${files.length}`);
    for (const file of files) {
      const text = await readFile(join(AGENTS_DIR, file), "utf-8");
      for (const needle of rules.requiredSubstrings) {
        assert.ok(text.includes(needle), `${file} must mention ${needle}`);
      }
      for (const needle of rules.bannedSubstrings) {
        assert.ok(!text.includes(needle), `${file} leaked ${JSON.stringify(needle)}`);
      }
    }
  });

  it("documents the install tree in pack/SETUP.md", async () => {
    const setup = await readFile(join(REPO_ROOT, "pack", "SETUP.md"), "utf-8");
    assert.match(setup, /closed-loop-agents/);
    assert.match(setup, /building-blocks/);
    assert.match(setup, /context\//);
    assert.match(setup, /init-pack/);
    assert.match(setup, /export-template/);
  });
});
