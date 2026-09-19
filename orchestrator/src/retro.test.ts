import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  loadLearningsExcerpt,
  loadLearningsForStage,
  normalizeLearning,
  runRetro,
} from "./retro.js";
import type { Handoff, HandoffLearning } from "./types.js";

function handoff(
  agent: string,
  learning: HandoffLearning,
  ts = "2026-08-29T00:00:00.000Z",
): Handoff {
  return {
    agent,
    status: "success",
    summary: "ok",
    timestamp: ts,
    learnings: [learning],
  };
}

describe("retro", () => {
  it("routes a question to loop/learnings.md", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await runRetro(
      dir,
      [
        handoff("reviewer", {
          forAgents: ["software-engineer"],
          insight: "Is the free leaderboard a trust boundary?",
          action: "Need a decision before implementing auth",
          kind: "question",
        }),
      ],
      1,
    );

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    assert.match(md, /Open Questions/);
    assert.match(md, /Is the free leaderboard a trust boundary/);
    assert.match(md, /reviewer → software-engineer/);
  });

  it("does not duplicate a question already in learnings.md", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await writeFile(
      join(dir, "learnings.md"),
      "# Open Questions\n\n- [reviewer → software-engineer] Is the free leaderboard a trust boundary?\n",
    );
    await runRetro(
      dir,
      [
        handoff("reviewer", {
          forAgents: ["software-engineer"],
          insight: "Is the free leaderboard a trust boundary?",
          action: "Need decision",
          kind: "question",
        }),
      ],
      2,
    );

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const count = md.split("Is the free leaderboard a trust boundary").length - 1;
    assert.equal(count, 1, "question must not be duplicated");
  });

  it("drops a one-off single-agent lesson (no target file)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await runRetro(
      dir,
      [
        handoff("reviewer", {
          forAgents: ["all"],
          insight: "one-off observation not worth promoting",
          action: "noted",
          topic: "general",
        }),
      ],
      1,
    );

    let md: string;
    try {
      md = await readFile(join(dir, "learnings.md"), "utf-8");
    } catch {
      md = "";
    }
    assert.doesNotMatch(md, /one-off observation/);
  });

  it("returns a placeholder when learnings.md is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const excerpt = await loadLearningsExcerpt(dir);
    assert.match(excerpt, /no learnings yet/);
  });

  it("loadLearningsForStage returns open questions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await writeFile(
      join(dir, "learnings.md"),
      "# Open Questions\n\n- [security-reviewer → software-engineer] One slot or stacking?\n",
    );
    const result = await loadLearningsForStage(dir, "software-engineer");
    assert.match(result, /Open Questions/);
    assert.match(result, /One slot or stacking/);
  });

  it("normalises alias learning schemas (lesson/type → insight/kind)", () => {
    const canonical = normalizeLearning({
      type: "pitfall",
      lesson: "Grep tests went green while the bug was live",
      recommendation: "Invoke the unit and assert output",
      for: ["verifier"],
    });
    assert.equal(canonical?.insight, "Grep tests went green while the bug was live");
    assert.equal(canonical?.action, "Invoke the unit and assert output");
    assert.equal(canonical?.kind, "pitfall");
    assert.deepEqual(canonical?.forAgents, ["verifier"]);
  });

  it("normalizeLearning returns null for missing required fields", () => {
    assert.equal(normalizeLearning(null), null);
    assert.equal(normalizeLearning({}), null);
    assert.equal(normalizeLearning({ insight: "no action" }), null);
    assert.equal(normalizeLearning({ action: "no insight" }), null);
  });

  it("handles handoffs with no learnings gracefully", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await runRetro(
      dir,
      [
        {
          agent: "verifier",
          status: "success",
          summary: "all tests pass",
          timestamp: "2026-08-29T00:00:00.000Z",
        },
      ],
      1,
    );
    const excerpt = await loadLearningsExcerpt(dir);
    assert.match(excerpt, /no learnings yet/);
  });

  it("deduplicates the same insight from multiple handoffs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const learning: HandoffLearning = {
      forAgents: ["software-engineer"],
      insight: "same insight from two agents",
      action: "do the thing",
      kind: "question",
    };
    await runRetro(
      dir,
      [handoff("reviewer", learning), handoff("security-reviewer", learning)],
      1,
    );

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const count = md.split("same insight from two agents").length - 1;
    assert.equal(count, 1, "insight must appear only once even from two agents");
  });

  it("creates learnings.md from scratch when it does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await runRetro(
      dir,
      [
        handoff("software-engineer", {
          forAgents: ["software-engineer"],
          insight: "Need to clarify auth flow",
          action: "Ask product about SSO requirement",
          kind: "question",
        }),
      ],
      1,
    );

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    assert.match(md, /# Open Questions/);
    assert.match(md, /Need to clarify auth flow/);
  });
});
