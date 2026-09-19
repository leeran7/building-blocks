import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Handoff, HandoffLearning } from "./types.js";
import { REPO_ROOT } from "./types.js";

const EMPTY_LEARNINGS = `# Open Questions

Questions that need a human decision before agents can proceed.
`;

const ROUTING_TABLE: Array<{
  match: (entry: NormalizedLearning) => boolean;
  target: string;
}> = [
  {
    match: (e) => e.kind === "question",
    target: "loop/learnings.md",
  },
  {
    match: (e) =>
      !isProductSpecific(e) && e.seenByAgents.size >= 2,
    target: "skills/closed-loop/gates.md",
  },
  {
    match: (e) => {
      const t = e.topic.toLowerCase();
      return t === "testing" || t === "test";
    },
    target: ".claude/rules/testing.md",
  },
  {
    match: (e) => e.topic.toLowerCase() === "security",
    target: ".claude/rules/security.md",
  },
  {
    match: (e) => {
      const t = e.topic.toLowerCase();
      return (
        t === "architecture" ||
        t === "architecture & contracts" ||
        t === "contracts"
      );
    },
    target: ".claude/rules/architecture.md",
  },
  {
    match: (e) =>
      isProductSpecific(e) &&
      (e.topic.toLowerCase() === "trust" ||
        e.topic.toLowerCase() === "security"),
    target: "context/trust.md",
  },
  {
    match: (e) =>
      isProductSpecific(e) && e.topic.toLowerCase() === "conventions",
    target: "context/conventions.md",
  },
  {
    match: (e) => {
      const t = e.topic.toLowerCase();
      return t === "ux" || t === "design" || t.startsWith("ux ");
    },
    target: "context/ux.md",
  },
];

function isProductSpecific(entry: NormalizedLearning): boolean {
  const targets = [...entry.forAgents];
  return (
    !targets.includes("all") &&
    targets.some((a) =>
      ["implementer", "frontend", "backend", "product-spec"].includes(a),
    )
  );
}

interface NormalizedLearning {
  insight: string;
  action: string;
  kind: HandoffLearning["kind"];
  topic: string;
  forAgents: string[];
  confidence: string;
  sourceAgent: string;
  seenByAgents: Set<string>;
  seenInIterations: Set<number>;
}

export function normalizeLearning(raw: unknown): HandoffLearning | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const insight = firstString(record, ["insight", "lesson", "message", "finding"]);
  const action = firstString(record, ["action", "recommendation", "fix", "do"]);
  if (!insight || !action) return null;
  const forAgents = firstStringArray(record, ["forAgents", "agents", "for"]) ?? ["all"];
  const kind = firstString(record, ["kind", "type"]);
  const allowedKind = ["lesson", "pattern", "pitfall", "metric", "question"] as const;
  return {
    forAgents,
    insight,
    action,
    topic: firstString(record, ["topic"]) ?? "general",
    kind: allowedKind.includes(kind as (typeof allowedKind)[number])
      ? (kind as HandoffLearning["kind"])
      : "lesson",
    confidence: firstString(record, ["confidence"]) === "high"
      ? "high"
      : firstString(record, ["confidence"]) === "low"
        ? "low"
        : "medium",
  };
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return value;
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return undefined;
}

function collectLearnings(handoffs: Handoff[]): NormalizedLearning[] {
  const byInsight = new Map<string, NormalizedLearning>();

  for (const handoff of handoffs) {
    for (const raw of handoff.learnings ?? []) {
      const learning = normalizeLearning(raw);
      if (!learning) continue;

      const key = learning.insight;
      const existing = byInsight.get(key);
      if (existing) {
        existing.seenByAgents.add(handoff.agent);
        continue;
      }

      byInsight.set(key, {
        insight: learning.insight,
        action: learning.action,
        kind: learning.kind ?? "lesson",
        topic: learning.topic ?? "general",
        forAgents: learning.forAgents,
        confidence: learning.confidence ?? "medium",
        sourceAgent: handoff.agent,
        seenByAgents: new Set([handoff.agent]),
        seenInIterations: new Set(),
      });
    }
  }

  return [...byInsight.values()];
}

function routeLearning(entry: NormalizedLearning): string | null {
  for (const route of ROUTING_TABLE) {
    if (route.match(entry)) return route.target;
  }

  if (entry.forAgents.length === 1 && entry.forAgents[0] !== "all") {
    return `agents/${entry.forAgents[0]}.md`;
  }

  if (entry.seenByAgents.size >= 2 || entry.seenInIterations.size >= 2) {
    return "skills/closed-loop/gates.md";
  }

  return null;
}

async function appendToFile(repoRoot: string, relativePath: string, line: string): Promise<void> {
  const fullPath = join(repoRoot, relativePath);
  let content = "";
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    return;
  }
  if (content.includes(line)) return;
  const nl = content.endsWith("\n") ? "" : "\n";
  await writeFile(fullPath, `${content}${nl}${line}\n`);
}

async function addOpenQuestion(loopDir: string, entry: NormalizedLearning): Promise<void> {
  const mdPath = join(loopDir, "learnings.md");
  let md: string;
  try {
    md = await readFile(mdPath, "utf-8");
  } catch {
    md = EMPTY_LEARNINGS;
  }

  const bullet = formatQuestionBullet(entry);
  if (md.includes(entry.insight)) return;

  const nl = md.endsWith("\n") ? "" : "\n";
  await writeFile(mdPath, `${md}${nl}${bullet}\n`);
}

function formatQuestionBullet(entry: NormalizedLearning): string {
  const targets = entry.forAgents.filter((a) => a !== "all");
  const from = entry.sourceAgent;
  const to = targets.length > 0 ? targets.join(", ") : "all";
  return `- [${from} → ${to}] ${entry.insight}`;
}

function formatPromotionBullet(entry: NormalizedLearning): string {
  return `- ${entry.insight} — ${entry.action}`;
}

export async function runRetro(
  loopDir: string,
  handoffs: Handoff[],
  _iteration: number,
): Promise<void> {
  await mkdir(loopDir, { recursive: true });
  const learnings = collectLearnings(handoffs);
  if (learnings.length === 0) return;

  for (const entry of learnings) {
    const target = routeLearning(entry);
    if (!target) continue;

    if (target === "loop/learnings.md") {
      await addOpenQuestion(loopDir, entry);
    } else {
      await appendToFile(REPO_ROOT, target, formatPromotionBullet(entry));
    }
  }
}

export async function loadLearningsExcerpt(loopDir: string): Promise<string> {
  try {
    const md = await readFile(join(loopDir, "learnings.md"), "utf-8");
    return md.trim().slice(0, 8000) || "(no open questions)";
  } catch {
    return "(no learnings yet — create loop/learnings.md on first run)";
  }
}

export async function loadLearningsForStage(
  loopDir: string,
  _stage: string,
): Promise<string> {
  return loadLearningsExcerpt(loopDir);
}
