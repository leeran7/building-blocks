import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { latestHandoff, loadAgentPrompt, type Handoff } from "./types.js";

async function writeHandoff(
  dir: string,
  stage: string,
  handoff: Partial<Handoff> & { agent: string },
  extras?: { omitTimestamp?: boolean },
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const body: Record<string, unknown> = {
    status: "success",
    summary: "ok",
    timestamp: "2026-08-29T12:00:00.000Z",
    ...handoff,
  };
  if (extras?.omitTimestamp) delete body.timestamp;
  await writeFile(
    join(dir, `${stage}-2026-08-29T12-00-00Z.json`),
    JSON.stringify(body),
  );
}

describe("latestHandoff", () => {
  it("prefers loop/handoffs over a legacy dir", async () => {
    const root = await mkdtemp(join(tmpdir(), "handoffs-"));
    const canonical = join(root, "loop", "handoffs");
    const legacy = join(root, ".cursor", "loop", "handoffs");
    await writeHandoff(canonical, "reviewer", {
      agent: "reviewer",
      summary: "canonical",
      timestamp: "2026-08-29T12:00:00.000Z",
    });
    await writeHandoff(legacy, "reviewer", {
      agent: "reviewer",
      summary: "legacy",
      timestamp: "2026-08-29T13:00:00.000Z",
    });

    const found = await latestHandoff("reviewer", { dirs: [canonical, legacy] });
    assert.equal(found?.summary, "canonical");
  });

  it("rejects timestamp-less files when notBefore is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoffs-"));
    await writeHandoff(dir, "reviewer", { agent: "reviewer" }, { omitTimestamp: true });
    const found = await latestHandoff("reviewer", {
      dirs: [dir],
      notBefore: "2026-08-29T00:00:00.000Z",
    });
    assert.equal(found, null);
  });

  it("rejects files whose agent field does not match the stage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoffs-"));
    await writeHandoff(dir, "security-reviewer", {
      agent: "implementer",
      timestamp: "2026-08-29T12:00:00.000Z",
    });
    const found = await latestHandoff("security-reviewer", { dirs: [dir] });
    assert.equal(found, null);
  });

  it("accepts a this-run handoff with matching agent and timestamp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "handoffs-"));
    const notBefore = new Date(Date.now() - 60_000).toISOString();
    await writeHandoff(dir, "verifier", {
      agent: "verifier",
      timestamp: new Date().toISOString(),
      summary: "fresh",
    });
    const found = await latestHandoff("verifier", { dirs: [dir], notBefore });
    assert.equal(found?.summary, "fresh");
  });
});

describe("loadAgentPrompt", () => {
  it("prepends protocol.md so yarn loop gets kernel protocol and gates", async () => {
    const prompt = await loadAgentPrompt("reviewer");
    assert.match(prompt, /<!-- closed-loop:protocol -->/);
    assert.match(prompt, /<!-- \/closed-loop:protocol -->/);
    assert.match(prompt, /gates\.md/);
    assert.match(prompt, /You are the reviewer/);
    const marker = prompt.indexOf("<!-- /closed-loop:protocol -->");
    const role = prompt.indexOf("You are the reviewer");
    assert.ok(marker >= 0 && role > marker, "protocol must precede the role body");
  });
});
