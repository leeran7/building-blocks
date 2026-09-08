import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  EMPTY_LEDGER,
  loadLearningsExcerpt,
  loadLearningsForStage,
  normalizeLearning,
  persistHandoffLearnings,
  runRetro,
} from "./retro.js";
import type { Handoff, HandoffLearning } from "./types.js";

function handoff(
  agent: string,
  learnings: HandoffLearning[],
  ts = "2026-08-29T00:00:00.000Z",
): Handoff {
  return { agent, status: "success", summary: "ok", timestamp: ts, learnings };
}

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "learnings-"));
}

async function readMd(dir: string): Promise<string> {
  return readFile(join(dir, "learnings.md"), "utf-8");
}

describe("normalizeLearning", () => {
  it("keeps only forAgents/insight/action and tolerates aliases", () => {
    const result = normalizeLearning({
      lesson: "raw body read twice",
      fix: "buffer it once",
      for: "implementer",
      kind: "pitfall",
      confidence: "high",
    });
    assert.deepEqual(result, {
      forAgents: ["implementer"],
      insight: "raw body read twice",
      action: "buffer it once",
    });
  });

  it("returns null without both insight and action", () => {
    assert.equal(normalizeLearning({ insight: "only insight" }), null);
    assert.equal(normalizeLearning(null), null);
  });

  it("defaults forAgents to all", () => {
    const result = normalizeLearning({ insight: "x", action: "y" });
    assert.deepEqual(result?.forAgents, ["all"]);
  });
});

describe("persistHandoffLearnings", () => {
  it("appends a note bullet and creates the ledger if missing", async () => {
    const dir = await tmp();
    await persistHandoffLearnings(
      handoff("verifier", [
        { forAgents: ["implementer"], insight: "guard the empty case", action: "add a null check" },
      ]),
      dir,
    );
    const md = await readMd(dir);
    assert.match(md, /## Notes/);
    assert.match(md, /- \[implementer\] guard the empty case → add a null check/);
  });

  it("dedupes by insight — no duplicate bullets across runs", async () => {
    const dir = await tmp();
    const same = handoff("verifier", [
      { forAgents: ["implementer"], insight: "same insight", action: "do the thing" },
    ]);
    await persistHandoffLearnings(same, dir);
    await persistHandoffLearnings(same, dir);
    const md = await readMd(dir);
    const count = md.split("same insight").length - 1;
    assert.equal(count, 1);
  });

  it("caps Notes at 30 (newest first)", async () => {
    const dir = await tmp();
    for (let i = 0; i < 35; i++) {
      await persistHandoffLearnings(
        handoff("verifier", [
          { forAgents: ["all"], insight: `insight ${i}`, action: `action ${i}` },
        ]),
        dir,
      );
    }
    const md = await readMd(dir);
    const bullets = md.split("\n").filter((line) => line.startsWith("- "));
    assert.equal(bullets.length, 30);
    assert.match(md, /insight 34/); // newest kept
    assert.doesNotMatch(md, /insight 4 →/); // oldest evicted
  });

  it("does nothing when the handoff has no learnings", async () => {
    const dir = await tmp();
    await persistHandoffLearnings(handoff("verifier", []), dir);
    assert.match(await loadLearningsExcerpt(dir), /no learnings yet/);
  });
});

describe("runRetro", () => {
  it("persists every dispatched handoff's learnings", async () => {
    const dir = await tmp();
    await runRetro(
      dir,
      [
        handoff("reviewer", [{ forAgents: ["implementer"], insight: "r1", action: "fix r1" }]),
        handoff("security-reviewer", [{ forAgents: ["implementer"], insight: "s1", action: "fix s1" }]),
      ],
      1,
    );
    const md = await readMd(dir);
    assert.match(md, /r1 → fix r1/);
    assert.match(md, /s1 → fix s1/);
  });
});

describe("loadLearningsForStage", () => {
  it("returns standing rules plus notes tagged for the stage or all", async () => {
    const dir = await tmp();
    const seeded = EMPTY_LEDGER.replace(
      "## Notes (recent — newest first)\n",
      [
        "## Notes (recent — newest first)",
        "- [implementer] impl note → do x",
        "- [reviewer] reviewer note → do y",
        "- [all] global note → do z",
        "",
      ].join("\n"),
    ).replace(
      "## Standing rules (always apply)\n",
      "## Standing rules (always apply)\n- [all] never grep-assert behaviour → invoke the unit\n",
    );
    await writeFile(join(dir, "learnings.md"), seeded);

    const forImpl = await loadLearningsForStage(dir, "implementer");
    assert.match(forImpl, /never grep-assert/); // standing always included
    assert.match(forImpl, /impl note/);
    assert.match(forImpl, /global note/);
    assert.doesNotMatch(forImpl, /reviewer note/);
  });

  it("reports no learnings when the ledger is absent", async () => {
    const dir = await tmp();
    assert.match(await loadLearningsForStage(dir, "implementer"), /no learnings yet/);
  });
});
