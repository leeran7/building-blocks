import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMemoryGraph,
  communityByTopic,
  formatGraphExcerpt,
  graphStats,
  learningsCitingFile,
  learningsForAgent,
  neighbors,
  parseEvidenceFiles,
  shortestPath,
  stageDefaultTopics,
  type LearningRecord,
} from "./memory-graph.js";

const FIXTURE: LearningRecord[] = [
  {
    agent: "reviewer",
    kind: "pitfall",
    topic: "Architecture & contracts",
    forAgents: ["implementer", "verifier"],
    insight: "Never assert behaviour by grepping source text.",
    action: "Invoke the unit and assert its output.",
    evidence: "orchestrator/src/stages.test.ts:40-55",
    status: "standing",
  },
  {
    agent: "security-reviewer",
    kind: "pitfall",
    topic: "Security",
    forAgents: ["implementer", "architect"],
    insight: "Anti-cheat module had zero production callers.",
    action: "Assert security controls are reachable from a request handler.",
    evidence: "app/src/game/antiCheat.ts:28,83",
    status: "standing",
  },
  {
    agent: "frontend",
    kind: "lesson",
    topic: "Performance",
    forAgents: ["implementer", "all"],
    insight: "Per-floor RNG made geometry queries O(floor^2).",
    action: "Keep closed-form or prefix-sum geometry.",
    evidence: "app/src/game/towers.ts:109-143",
    status: "open",
  },
  {
    agent: "devops",
    kind: "pitfall",
    topic: "Build / CI",
    forAgents: ["all"],
    insight: "A quality gate is not a gate until proven to fail.",
    action: "Feed a deliberately violating input and confirm red.",
    evidence: ".github/workflows/ci.yml:10-40",
    status: "standing",
  },
];

describe("memory-graph", () => {
  it("builds typed nodes and edges from learnings", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const stats = graphStats(graph);
    assert.equal(stats.learning, 4);
    assert.ok(stats.agent >= 5);
    assert.ok(stats.topic >= 4);
    assert.ok(stats.file >= 4);
    assert.ok(stats.edges > 10);
  });

  it("finds learnings targeting an agent", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const forImplementer = learningsForAgent(graph, "implementer");
    const labels = forImplementer.map((node) => node.label);
    assert.ok(labels.some((label) => label.includes("grepping")));
    assert.ok(labels.some((label) => label.includes("Anti-cheat")));
    assert.ok(labels.some((label) => label.includes("O(floor^2)")));
  });

  it("groups a topic community", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const security = communityByTopic(graph, "Security");
    assert.equal(security.length, 1);
    assert.match(security[0].label, /Anti-cheat/);
  });

  it("finds learnings that cite a file path", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const hits = learningsCitingFile(graph, "antiCheat.ts");
    assert.equal(hits.length, 1);
    assert.match(hits[0].label, /Anti-cheat/);
  });

  it("parses evidence file paths with optional line ranges", () => {
    assert.deepEqual(
      parseEvidenceFiles(
        "app/src/game/antiCheat.ts:28,83; app/src/game/towers.ts:109-143",
      ),
      ["app/src/game/antiCheat.ts", "app/src/game/towers.ts"],
    );
  });

  it("returns a shortest path across a shared agent", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const a = [...graph.nodes.values()].find((node) =>
      node.label.includes("grepping"),
    )!;
    const b = [...graph.nodes.values()].find((node) =>
      node.label.includes("O(floor^2)"),
    )!;
    const path = shortestPath(graph, a.id, b.id, 4);
    assert.ok(path);
    assert.ok(path!.nodes.length >= 3);
    assert.equal(path!.nodes[0], a.id);
    assert.equal(path!.nodes.at(-1), b.id);
  });

  it("lists outbound neighbors for a learning node", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const learning = [...graph.nodes.values()].find((node) =>
      node.label.includes("quality gate"),
    )!;
    const outs = neighbors(graph, learning.id, { direction: "out" });
    const types = new Set(outs.map((hit) => hit.edge.type));
    assert.ok(types.has("authored_by"));
    assert.ok(types.has("about_topic"));
    assert.ok(types.has("targets_agent"));
    assert.ok(types.has("cites"));
  });

  it("formats a ranked excerpt for a stage focus", () => {
    const graph = buildMemoryGraph(FIXTURE);
    const excerpt = formatGraphExcerpt(graph, {
      agent: "implementer",
      topics: stageDefaultTopics("implementer"),
    });
    assert.match(excerpt, /Graph-scoped learnings/);
    assert.match(excerpt, /agent:implementer|agent=implementer/);
    assert.match(excerpt, /grepping|Anti-cheat|O\(floor\^2\)|quality gate/);
  });

  it("skips entries without an insight", () => {
    const graph = buildMemoryGraph([
      { agent: "reviewer", insight: "   " },
      { agent: "reviewer", insight: "Real insight", forAgents: ["all"] },
    ]);
    assert.equal(graphStats(graph).learning, 1);
  });
});
