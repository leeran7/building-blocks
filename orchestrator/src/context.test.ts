import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadProfile, loadRepoContextExcerpt, packageManagerFor } from "./context.js";

describe("repo context", () => {
  it("returns a missing-folder message when context/ is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "no-context-"));
    const excerpt = await loadRepoContextExcerpt(root);
    assert.match(excerpt, /no context\/ folder/);
  });

  it("loads profile.json and concatenates context files", async () => {
    const root = await mkdtemp(join(tmpdir(), "with-context-"));
    await mkdir(join(root, "context"));
    await writeFile(
      join(root, "context", "profile.json"),
      JSON.stringify({
        name: "demo",
        packageManagers: [{ path: ".", command: "yarn" }, { path: "app", command: "pnpm" }],
      }),
    );
    await writeFile(join(root, "context", "README.md"), "Read this first.\n");
    const profile = await loadProfile(root);
    assert.equal(profile?.name, "demo");
    assert.equal(packageManagerFor(profile, "app"), "pnpm");
    assert.equal(packageManagerFor(profile, "."), "yarn");
    const excerpt = await loadRepoContextExcerpt(root);
    assert.match(excerpt, /context\/README.md/);
    assert.match(excerpt, /Read this first/);
    assert.match(excerpt, /"name":"demo"/);
  });
});
