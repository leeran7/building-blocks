import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadLearningsExcerpt, persistHandoffLearnings, runRetro } from "./retro.js";
import type { Handoff } from "./types.js";

describe("retro", () => {
  it("persists read-only reviewer learnings into jsonl and folds them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const handoff: Handoff = {
      agent: "reviewer",
      status: "success",
      summary: "ok",
      timestamp: "2026-08-29T00:00:00.000Z",
      learnings: [
        {
          forAgents: ["implementer"],
          insight: "Missing handoff was treated as success",
          action: "Fail the stage when the handoff file is absent",
          kind: "pitfall",
        },
      ],
    };

    await runRetro(dir, [handoff], 1);

    const jsonl = await readFile(join(dir, "learnings.jsonl"), "utf-8");
    assert.match(jsonl, /Missing handoff was treated as success/);
    assert.match(jsonl, /"status":"curated"/);

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    assert.match(md, /orchestrator retro \(iteration 1\)/);
    assert.match(md, /Fail the stage when the handoff file is absent/);
  });

  it("does not duplicate an insight already in the ledger", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const handoff: Handoff = {
      agent: "security-reviewer",
      status: "success",
      summary: "ok",
      timestamp: "2026-08-29T00:00:00.000Z",
      learnings: [
        {
          forAgents: ["all"],
          insight: "same insight",
          action: "do the thing",
        },
      ],
    };
    await persistHandoffLearnings(handoff, dir);
    await persistHandoffLearnings(handoff, dir);
    const jsonl = await readFile(join(dir, "learnings.jsonl"), "utf-8");
    const lines = jsonl.trim().split("\n");
    assert.equal(lines.length, 1);
  });

  it("returns a placeholder when the ledger is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const excerpt = await loadLearningsExcerpt(dir);
    assert.match(excerpt, /no learnings yet/);
  });
});
