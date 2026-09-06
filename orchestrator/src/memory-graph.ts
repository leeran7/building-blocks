/**
 * Typed memory graph over loop/learnings.jsonl.
 *
 * Nodes: learning | agent | topic | kind | file | status
 * Edges: authored_by | about_topic | of_kind | targets_agent | cites | has_status
 *
 * GraphRAG-lite for agent memory: traverse relations instead of stuffing the
 * whole ledger into every prompt.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type MemoryNodeKind =
  | "learning"
  | "agent"
  | "topic"
  | "kind"
  | "file"
  | "status";

export type MemoryEdgeType =
  | "authored_by"
  | "about_topic"
  | "of_kind"
  | "targets_agent"
  | "cites"
  | "has_status";

export interface MemoryNode {
  id: string;
  kind: MemoryNodeKind;
  label: string;
  data?: Record<string, unknown>;
}

export interface MemoryEdge {
  from: string;
  to: string;
  type: MemoryEdgeType;
}

export interface LearningRecord {
  ts?: string;
  agent?: string;
  agents?: string[];
  kind?: string;
  topic?: string;
  forAgents?: string[];
  insight?: string;
  action?: string;
  evidence?: string;
  confidence?: string;
  status?: string;
  iteration?: number;
  iterations?: number[];
}

export interface MemoryGraph {
  nodes: Map<string, MemoryNode>;
  out: Map<string, MemoryEdge[]>;
  in: Map<string, MemoryEdge[]>;
}

export interface NeighborHit {
  edge: MemoryEdge;
  node: MemoryNode;
  direction: "out" | "in";
}

export interface PathResult {
  nodes: string[];
  edges: MemoryEdge[];
}

export interface GraphFocus {
  agent?: string;
  topics?: string[];
  files?: string[];
}

const LEARNING_EXCERPT_LIMIT = 12;
const ACTION_SNIPPET = 160;

export function buildMemoryGraph(entries: LearningRecord[]): MemoryGraph {
  const graph = emptyGraph();
  for (const entry of entries) {
    if (!entry.insight?.trim()) continue;
    addLearning(graph, entry);
  }
  return graph;
}

export async function loadMemoryGraph(loopDir: string): Promise<MemoryGraph> {
  const entries = await readLearningRecords(join(loopDir, "learnings.jsonl"));
  return buildMemoryGraph(entries);
}

export function neighbors(
  graph: MemoryGraph,
  nodeId: string,
  opts?: { edgeTypes?: MemoryEdgeType[]; direction?: "out" | "in" | "both" },
): NeighborHit[] {
  const direction = opts?.direction ?? "both";
  const allowed = opts?.edgeTypes ? new Set(opts.edgeTypes) : null;
  const hits: NeighborHit[] = [];

  if (direction === "out" || direction === "both") {
    for (const edge of graph.out.get(nodeId) ?? []) {
      if (allowed && !allowed.has(edge.type)) continue;
      const node = graph.nodes.get(edge.to);
      if (node) hits.push({ edge, node, direction: "out" });
    }
  }
  if (direction === "in" || direction === "both") {
    for (const edge of graph.in.get(nodeId) ?? []) {
      if (allowed && !allowed.has(edge.type)) continue;
      const node = graph.nodes.get(edge.from);
      if (node) hits.push({ edge, node, direction: "in" });
    }
  }
  return hits;
}

export function shortestPath(
  graph: MemoryGraph,
  fromId: string,
  toId: string,
  maxHops = 6,
): PathResult | null {
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null;
  if (fromId === toId) return { nodes: [fromId], edges: [] };

  const queue: string[] = [fromId];
  const prev = new Map<string, { node: string; edge: MemoryEdge }>();
  const seen = new Set<string>([fromId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = reconstructPath(prev, fromId, current).nodes.length - 1;
    if (depth >= maxHops) continue;

    for (const edge of [
      ...(graph.out.get(current) ?? []),
      ...(graph.in.get(current) ?? []).map(reverseEdge),
    ]) {
      const next = edge.to;
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: current, edge });
      if (next === toId) return reconstructPath(prev, fromId, toId);
      queue.push(next);
    }
  }
  return null;
}

export function learningsForAgent(graph: MemoryGraph, agent: string): MemoryNode[] {
  const agentId = typedNodeId("agent", agent);
  const viaTarget = neighbors(graph, agentId, {
    edgeTypes: ["targets_agent"],
    direction: "in",
  }).map((hit) => hit.node);
  const viaAuthor = neighbors(graph, agentId, {
    edgeTypes: ["authored_by"],
    direction: "in",
  }).map((hit) => hit.node);
  return uniqueLearningNodes([...viaTarget, ...viaAuthor]);
}

export function communityByTopic(graph: MemoryGraph, topic: string): MemoryNode[] {
  const topicId = typedNodeId("topic", topic);
  return neighbors(graph, topicId, {
    edgeTypes: ["about_topic"],
    direction: "in",
  }).map((hit) => hit.node);
}

export function learningsCitingFile(
  graph: MemoryGraph,
  filePath: string,
): MemoryNode[] {
  const exact = typedNodeId("file", normalizeFilePath(filePath));
  if (graph.nodes.has(exact)) {
    return neighbors(graph, exact, {
      edgeTypes: ["cites"],
      direction: "in",
    }).map((hit) => hit.node);
  }

  const needle = normalizeFilePath(filePath).toLowerCase();
  const matches: MemoryNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== "file") continue;
    if (!node.label.toLowerCase().includes(needle)) continue;
    matches.push(
      ...neighbors(graph, node.id, {
        edgeTypes: ["cites"],
        direction: "in",
      }).map((hit) => hit.node),
    );
  }
  return uniqueLearningNodes(matches);
}

export function formatGraphExcerpt(
  graph: MemoryGraph,
  focus: GraphFocus,
  limit = LEARNING_EXCERPT_LIMIT,
): string {
  const ranked = new Map<string, { node: MemoryNode; score: number; why: string[] }>();

  const bump = (node: MemoryNode, score: number, why: string) => {
    if (node.kind !== "learning") return;
    const existing = ranked.get(node.id);
    if (existing) {
      existing.score += score;
      if (!existing.why.includes(why)) existing.why.push(why);
      return;
    }
    ranked.set(node.id, { node, score, why: [why] });
  };

  if (focus.agent) {
    for (const node of learningsForAgent(graph, focus.agent)) {
      bump(node, 3, `agent:${focus.agent}`);
    }
    for (const node of learningsForAgent(graph, "all")) {
      bump(node, 2, "agent:all");
    }
  }

  for (const topic of focus.topics ?? []) {
    for (const node of communityByTopic(graph, topic)) {
      bump(node, 2, `topic:${topic}`);
    }
  }

  for (const file of focus.files ?? []) {
    for (const node of learningsCitingFile(graph, file)) {
      bump(node, 4, `file:${file}`);
    }
  }

  const ordered = [...ranked.values()]
    .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
    .slice(0, limit);

  if (ordered.length === 0) {
    return "(no graph-scoped learnings for this focus)";
  }

  const lines = [
    `## Graph-scoped learnings (${ordered.length})`,
    `_Focus: ${describeFocus(focus)}_`,
    "",
  ];
  for (const { node, why } of ordered) {
    const action = String(node.data?.action ?? "").slice(0, ACTION_SNIPPET);
    lines.push(`- [${why.join(", ")}] ${node.label}`);
    if (action) lines.push(`  → ${action}`);
  }
  return lines.join("\n");
}

export function graphStats(
  graph: MemoryGraph,
): Record<MemoryNodeKind | "edges", number> {
  const counts: Record<MemoryNodeKind | "edges", number> = {
    learning: 0,
    agent: 0,
    topic: 0,
    kind: 0,
    file: 0,
    status: 0,
    edges: 0,
  };
  for (const node of graph.nodes.values()) counts[node.kind] += 1;
  for (const edges of graph.out.values()) counts.edges += edges.length;
  return counts;
}

export function parseEvidenceFiles(evidence?: string): string[] {
  if (!evidence?.trim()) return [];
  const parts = evidence
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const files: string[] = [];
  for (const part of parts) {
    const match = part.match(/^([^\s:]+?\.[A-Za-z0-9]+)(?::\d[\d,-]*)?$/);
    if (match) files.push(normalizeFilePath(match[1]));
  }
  return [...new Set(files)];
}

export async function readLearningRecords(
  jsonlPath: string,
): Promise<LearningRecord[]> {
  let jsonl = "";
  try {
    jsonl = await readFile(jsonlPath, "utf-8");
  } catch {
    return [];
  }
  const entries: LearningRecord[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as LearningRecord);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export function stageDefaultTopics(stage: string): string[] {
  const map: Record<string, string[]> = {
    "product-spec": ["Spec quality", "Architecture & contracts"],
    architect: ["Architecture & contracts", "Security"],
    "design-ux": ["Spec quality", "Performance"],
    implementer: ["Architecture & contracts", "Testing", "Performance"],
    verifier: ["Testing", "Build / CI"],
    reviewer: ["Architecture & contracts", "Testing", "Spec quality"],
    "security-reviewer": ["Security"],
    "qa-acceptance": ["Spec quality", "Testing"],
    integrator: ["Build / CI", "Orchestration"],
    devops: ["Build / CI", "Orchestration"],
    release: ["Build / CI"],
    monitor: ["Orchestration"],
    docs: ["Spec quality", "Orchestration"],
    debugger: ["Testing", "Build / CI"],
  };
  return map[stage] ?? ["Orchestration"];
}

function emptyGraph(): MemoryGraph {
  return { nodes: new Map(), out: new Map(), in: new Map() };
}

function addLearning(graph: MemoryGraph, entry: LearningRecord): void {
  const insight = entry.insight!.trim();
  const learningId = learningNodeId(insight);
  ensureNode(graph, {
    id: learningId,
    kind: "learning",
    label: insight,
    data: {
      action: entry.action ?? "",
      confidence: entry.confidence ?? "medium",
      ts: entry.ts ?? "",
    },
  });

  for (const agent of uniqueStrings([entry.agent, ...(entry.agents ?? [])])) {
    link(graph, learningId, ensureTyped(graph, "agent", agent), "authored_by");
  }

  for (const agent of uniqueStrings(entry.forAgents ?? ["all"])) {
    link(graph, learningId, ensureTyped(graph, "agent", agent), "targets_agent");
  }

  if (entry.topic?.trim()) {
    link(
      graph,
      learningId,
      ensureTyped(graph, "topic", entry.topic.trim()),
      "about_topic",
    );
  }

  if (entry.kind?.trim()) {
    link(
      graph,
      learningId,
      ensureTyped(graph, "kind", entry.kind.trim()),
      "of_kind",
    );
  }

  if (entry.status?.trim()) {
    link(
      graph,
      learningId,
      ensureTyped(graph, "status", entry.status.trim()),
      "has_status",
    );
  }

  for (const file of parseEvidenceFiles(entry.evidence)) {
    link(graph, learningId, ensureTyped(graph, "file", file), "cites");
  }
}

function ensureTyped(
  graph: MemoryGraph,
  kind: Exclude<MemoryNodeKind, "learning">,
  label: string,
): string {
  const id = typedNodeId(kind, label);
  ensureNode(graph, { id, kind, label });
  return id;
}

function ensureNode(graph: MemoryGraph, node: MemoryNode): void {
  if (!graph.nodes.has(node.id)) {
    graph.nodes.set(node.id, node);
    graph.out.set(node.id, []);
    graph.in.set(node.id, []);
  }
}

function link(
  graph: MemoryGraph,
  from: string,
  to: string,
  type: MemoryEdgeType,
): void {
  const edge: MemoryEdge = { from, to, type };
  const outs = graph.out.get(from) ?? [];
  if (outs.some((existing) => existing.to === to && existing.type === type)) {
    return;
  }
  outs.push(edge);
  graph.out.set(from, outs);
  const ins = graph.in.get(to) ?? [];
  ins.push(edge);
  graph.in.set(to, ins);
}

function learningNodeId(insight: string): string {
  const hash = createHash("sha1").update(insight).digest("hex").slice(0, 12);
  return `learning:${hash}`;
}

function typedNodeId(
  kind: Exclude<MemoryNodeKind, "learning">,
  label: string,
): string {
  return `${kind}:${normalizeKey(label)}`;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value?.trim()) continue;
    const key = value.trim();
    const norm = key.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(key);
  }
  return out;
}

function uniqueLearningNodes(nodes: MemoryNode[]): MemoryNode[] {
  const seen = new Set<string>();
  const out: MemoryNode[] = [];
  for (const node of nodes) {
    if (node.kind !== "learning" || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function reverseEdge(edge: MemoryEdge): MemoryEdge {
  return { from: edge.to, to: edge.from, type: edge.type };
}

function reconstructPath(
  prev: Map<string, { node: string; edge: MemoryEdge }>,
  fromId: string,
  toId: string,
): PathResult {
  const nodes: string[] = [toId];
  const edges: MemoryEdge[] = [];
  let cursor = toId;
  while (cursor !== fromId) {
    const step = prev.get(cursor);
    if (!step) break;
    edges.unshift(step.edge);
    nodes.unshift(step.node);
    cursor = step.node;
  }
  return { nodes, edges };
}

function describeFocus(focus: GraphFocus): string {
  const parts: string[] = [];
  if (focus.agent) parts.push(`agent=${focus.agent}`);
  if (focus.topics?.length) parts.push(`topics=${focus.topics.join("|")}`);
  if (focus.files?.length) parts.push(`files=${focus.files.join("|")}`);
  return parts.join(", ") || "none";
}
