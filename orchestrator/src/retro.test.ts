import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { foldLearnings, loadLearningsExcerpt, persistHandoffLearnings, runRetro, normalizeLearning } from "./retro.js";
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

  it("folds an open entry under the matching topic heading, not only Recently applied", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await persistHandoffLearnings(
      handoff("verifier", {
        forAgents: ["implementer"],
        topic: "testing",
        insight: "source greps are not tests",
        action: "Invoke the unit and assert its output",
      }),
      dir,
      1,
    );
    await foldLearnings(dir, 1);

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const testing = md.split("### Testing")[1]?.split("### ")[0] ?? "";
    assert.match(testing, /source greps are not tests/);
    assert.match(md, /## Recently applied \(last 20\)[\s\S]*source greps are not tests/);
  });

  it("trims Recently applied to the 20 newest entries and keeps the rest under the topic", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    for (let i = 0; i < 25; i++) {
      await persistHandoffLearnings(
        handoff(
          "verifier",
          {
            forAgents: ["all"],
            topic: "testing",
            insight: `insight ${i}`,
            action: `action ${i}`,
          },
          `2026-08-29T00:00:${String(i).padStart(2, "0")}.000Z`,
        ),
        dir,
        1,
      );
    }
    await foldLearnings(dir, 1);

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const recent = md.split("## Recently applied (last 20)")[1] ?? "";
    const recentBullets = recent.split("\n").filter((line) => line.startsWith("- "));
    assert.equal(recentBullets.length, 20);
    assert.match(recent, /insight 24/);
    assert.doesNotMatch(recent, /insight 0/);
    const testing = md.split("### Testing")[1]?.split("### ")[0] ?? "";
    assert.match(testing, /insight 0/);
    assert.match(testing, /insight 24/);
  });

  it("promotes a lesson reported by two agents to standing rules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const learning = {
      forAgents: ["implementer"],
      topic: "security",
      insight: "unpaid checkout sessions were credited",
      action: "Gate credit on payment_status paid",
    };
    await persistHandoffLearnings(handoff("reviewer", learning), dir, 1);
    await persistHandoffLearnings(handoff("security-reviewer", learning), dir, 1);
    await foldLearnings(dir, 1);

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const standing = md.split("## Standing rules (always apply)")[1]?.split("## ")[0] ?? "";
    assert.match(standing, /unpaid checkout sessions were credited/);
    assert.match(standing, /reviewer/);
    assert.match(standing, /security-reviewer/);
  });

  it("promotes a lesson that recurs in a second iteration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    const learning = {
      forAgents: ["all"],
      topic: "orchestration",
      insight: "missing handoff was treated as success",
      action: "Fail the stage when the handoff file is absent",
    };
    await runRetro(dir, [handoff("reviewer", learning)], 1);
    await persistHandoffLearnings(handoff("reviewer", learning), dir, 2);
    await foldLearnings(dir, 2);

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const standing = md.split("## Standing rules (always apply)")[1]?.split("## ")[0] ?? "";
    assert.match(standing, /missing handoff was treated as success/);
  });

  it("does not promote a single-agent, single-iteration lesson", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await runRetro(
      dir,
      [
        handoff("reviewer", {
          forAgents: ["implementer"],
          insight: "one-off observation",
          action: "do not promote me",
        }),
      ],
      1,
    );
    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    const standing = md.split("## Standing rules (always apply)")[1]?.split("## ")[0] ?? "";
    assert.doesNotMatch(standing, /one-off observation/);
  });

  it("keeps wrapped Recently applied bullets and standing prose when folding a new entry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loop-retro-"));
    await writeFile(
      join(dir, "learnings.md"),
      `# Learnings Ledger

_Last curated: 2026-08-29T13:40:00Z — retro over the 2026-08-29 review pass
(\`3385d3f..f76090a\`)._

## Standing rules (always apply)

- **[all] A quality gate is not a gate until it has been proven to fail.**

## By topic
### Testing
- existing testing bullet that must survive

## Recently applied (last 20)
- 2026-08-29 — .gitignore switched from \`loop/\` to \`loop/*\` plus negations so the
  learnings ledger is version-controlled (F-16). Applied.
`,
    );
    await persistHandoffLearnings(
      handoff("verifier", {
        forAgents: ["all"],
        topic: "testing",
        insight: "fresh insight this iteration",
        action: "assert the handler, not the helper",
      }),
      dir,
      2,
    );
    await foldLearnings(dir, 2);

    const md = await readFile(join(dir, "learnings.md"), "utf-8");
    assert.match(md, /version-controlled \(F-16\)\. Applied/);
    assert.match(md, /A quality gate is not a gate until it has been proven to fail/);
    assert.match(md, /existing testing bullet that must survive/);
    assert.match(md, /orchestrator retro \(iteration 2\)/);
    assert.match(md, /fresh insight this iteration/);
  });

  it("normalises alias learning schemas (lesson/type → insight/kind)", async () => {
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

    const dir = await mkdtemp(join(tmpdir(), "loop-alias-"));
    await persistHandoffLearnings(
      {
        agent: "reviewer",
        status: "success",
        summary: "ok",
        timestamp: "2026-08-29T00:00:00.000Z",
        learnings: [
          {
            forAgents: ["all"],
            lesson: "alias insight",
            fix: "use the canonical fields",
          } as unknown as HandoffLearning,
        ],
      },
      dir,
    );
    const jsonl = await readFile(join(dir, "learnings.jsonl"), "utf-8");
    assert.match(jsonl, /alias insight/);
    assert.match(jsonl, /use the canonical fields/);
  });
});
