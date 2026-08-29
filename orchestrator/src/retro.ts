import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Handoff, HandoffLearning } from "./types.js";

const EMPTY_LEDGER = `# Learnings Ledger

_Last curated: never._

## Standing rules (always apply)

## By topic
### Testing
### Security
### Architecture & contracts
### Performance
### Spec quality
### Build / CI
### Orchestration

## Open questions (unresolved, need a decision)

## Recently applied (last 20)
`;

const RECENT_LIMIT = 20;

const TOPIC_HEADINGS: Array<{ keys: string[]; heading: string }> = [
  { keys: ["testing", "test"], heading: "### Testing" },
  { keys: ["security"], heading: "### Security" },
  { keys: ["architecture", "architecture & contracts", "contracts"], heading: "### Architecture & contracts" },
  { keys: ["performance"], heading: "### Performance" },
  { keys: ["spec", "spec quality", "product"], heading: "### Spec quality" },
  { keys: ["build / ci", "build", "ci"], heading: "### Build / CI" },
  { keys: ["orchestration", "orchestrator", "general"], heading: "### Orchestration" },
];

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

export async function persistHandoffLearnings(
  handoff: Handoff,
  loopDir: string,
  iteration?: number,
): Promise<void> {
  const learnings = handoff.learnings ?? [];
  if (learnings.length === 0) return;

  await mkdir(loopDir, { recursive: true });
  const jsonlPath = join(loopDir, "learnings.jsonl");
  const entries = await readLedger(jsonlPath);
  let changed = false;

  for (const raw of learnings) {
    const learning = normalizeLearning(raw);
    if (!learning) continue;
    const existing = entries.find((entry) => entry.insight === learning.insight);
    if (existing) {
      const before = JSON.stringify(existing);
      mergeOccurrence(existing, handoff.agent, iteration);
      if (JSON.stringify(existing) !== before) changed = true;
      continue;
    }
    entries.push({
      ts: handoff.timestamp,
      agent: handoff.agent,
      agents: [handoff.agent],
      iterations: iteration != null ? [iteration] : [],
      kind: learning.kind ?? "lesson",
      topic: learning.topic ?? "general",
      forAgents: learning.forAgents,
      insight: learning.insight,
      action: learning.action,
      confidence: learning.confidence ?? "medium",
      status: "open",
    });
    changed = true;
  }

  if (!changed) return;
  await writeLedger(jsonlPath, entries);
}

export async function foldLearnings(loopDir: string, iteration: number): Promise<void> {
  const mdPath = join(loopDir, "learnings.md");
  const jsonlPath = join(loopDir, "learnings.jsonl");

  let md: string;
  try {
    md = await readFile(mdPath, "utf-8");
  } catch {
    md = EMPTY_LEDGER;
  }

  const entries = await readLedger(jsonlPath);
  if (entries.length === 0) {
    await writeFile(mdPath, md);
    return;
  }

  const open = entries.filter((entry) => entry.status === "open");
  const promotions = entries.filter(
    (entry) => shouldPromote(entry) && !alreadyInStanding(md, entry),
  );

  if (open.length === 0 && promotions.length === 0) {
    await writeFile(mdPath, md);
    return;
  }

  const stamp = `_Last curated: ${new Date().toISOString()} by orchestrator retro (iteration ${iteration})._`;
  let nextMd = md.includes("_Last curated:")
    ? md.replace(/_Last curated:[\s\S]*?_/, stamp)
    : `${stamp}\n\n${md}`;

  const byHeading = new Map<string, string[]>();
  for (const entry of open) {
    if (!entry.insight || nextMd.includes(entry.insight)) continue;
    const heading = sectionHeading(entry);
    const bullets = byHeading.get(heading) ?? [];
    bullets.push(formatBullet(entry));
    byHeading.set(heading, bullets);
  }
  for (const [heading, bullets] of byHeading) {
    nextMd = appendBullets(nextMd, heading, bullets);
  }

  if (promotions.length > 0) {
    nextMd = appendBullets(
      nextMd,
      "## Standing rules (always apply)",
      promotions.map((entry) => formatStanding(entry)),
    );
  }

  if (open.length > 0) {
    const newestFirst = [...open].reverse().map((entry) => formatBullet(entry));
    const previous = parseRecentBullets(nextMd).filter(
      (bullet) => !newestFirst.includes(bullet),
    );
    nextMd = setSectionBody(nextMd, "## Recently applied (last 20)", [
      ...newestFirst,
      ...previous,
    ].slice(0, RECENT_LIMIT));
  }

  await writeFile(mdPath, nextMd);

  for (const entry of entries) {
    if (entry.status === "open") entry.status = "curated";
  }
  await writeLedger(jsonlPath, entries);
}

export async function runRetro(
  loopDir: string,
  handoffs: Handoff[],
  iteration: number,
): Promise<void> {
  await mkdir(loopDir, { recursive: true });
  for (const handoff of handoffs) {
    await persistHandoffLearnings(handoff, loopDir, iteration);
  }
  await foldLearnings(loopDir, iteration);
}

export async function loadLearningsExcerpt(loopDir: string): Promise<string> {
  try {
    const md = await readFile(join(loopDir, "learnings.md"), "utf-8");
    const standing = md.match(/## Standing rules[\s\S]*?(?=\n## )/)?.[0] ?? "";
    const recentIndex = md.lastIndexOf("## Recently applied");
    const recent = recentIndex >= 0 ? md.slice(recentIndex) : "";
    const excerpt = `${standing}\n\n${recent}`.trim() || md;
    return excerpt.slice(0, 8000);
  } catch {
    return "(no learnings yet — create loop/learnings.md on first run)";
  }
}

async function readLedger(jsonlPath: string): Promise<LedgerEntry[]> {
  let jsonl = "";
  try {
    jsonl = await readFile(jsonlPath, "utf-8");
  } catch {
    return [];
  }
  const entries: LedgerEntry[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as LedgerEntry);
    } catch {
      // skip malformed lines — the rest of the ledger is still foldable
    }
  }
  return entries;
}

async function writeLedger(jsonlPath: string, entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) {
    await writeFile(jsonlPath, "");
    return;
  }
  await writeFile(jsonlPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

function mergeOccurrence(entry: LedgerEntry, agent: string, iteration?: number): void {
  const agents = new Set(entry.agents ?? []);
  if (entry.agent) agents.add(entry.agent);
  agents.add(agent);
  entry.agents = [...agents];

  const iterations = new Set<number>(entry.iterations ?? []);
  if (typeof entry.iteration === "number") iterations.add(entry.iteration);
  if (iteration != null) iterations.add(iteration);
  entry.iterations = [...iterations];
}

function shouldPromote(entry: LedgerEntry): boolean {
  if (!entry.insight) return false;
  if (entry.kind === "metric" || entry.kind === "question") return false;
  const agents = new Set(entry.agents ?? []);
  if (entry.agent) agents.add(entry.agent);
  const iterations = new Set<number>(entry.iterations ?? []);
  if (typeof entry.iteration === "number") iterations.add(entry.iteration);
  return agents.size >= 2 || iterations.size >= 2;
}

function alreadyInStanding(md: string, entry: LedgerEntry): boolean {
  const standing = md.match(/## Standing rules[\s\S]*?(?=\n## )/)?.[0] ?? "";
  return Boolean(entry.insight && standing.includes(entry.insight));
}

function sectionHeading(entry: LedgerEntry): string {
  if (entry.kind === "question") {
    return "## Open questions (unresolved, need a decision)";
  }
  const topic = (entry.topic ?? "general").trim().toLowerCase();
  for (const { keys, heading } of TOPIC_HEADINGS) {
    if (keys.includes(topic) || heading.slice(4).toLowerCase() === topic) {
      return heading;
    }
  }
  return "### Orchestration";
}

function formatBullet(entry: LedgerEntry): string {
  const who = (entry.forAgents ?? ["all"]).join(", ");
  return `- [${who}] ${entry.insight ?? ""} → ${entry.action ?? ""}`;
}

function formatStanding(entry: LedgerEntry): string {
  const agents = new Set(entry.agents ?? []);
  if (entry.agent) agents.add(entry.agent);
  const seen = [...agents].join(", ");
  return `${formatBullet(entry)} _(${seen})_`;
}

function appendBullets(md: string, heading: string, bullets: string[]): string {
  if (bullets.length === 0) return md;
  const idx = md.indexOf(heading);
  const block = `${bullets.join("\n")}\n`;
  if (idx < 0) {
    const recent = md.indexOf("## Recently applied");
    const chunk = `\n${heading}\n${block}`;
    if (recent >= 0) return `${md.slice(0, recent)}${chunk}${md.slice(recent)}`;
    return `${md}${chunk}`;
  }
  const insertAt = sectionInsertAt(md, idx);
  const prefix = md.slice(0, insertAt);
  const nl = prefix.endsWith("\n") ? "" : "\n";
  return `${prefix}${nl}${block}${md.slice(insertAt)}`;
}

function setSectionBody(md: string, heading: string, bullets: string[]): string {
  const body = bullets.length > 0 ? `${bullets.join("\n")}\n` : "";
  const idx = md.indexOf(heading);
  if (idx < 0) return `${md}\n${heading}\n${body}`;
  const afterHeading = md.indexOf("\n", idx);
  const start = afterHeading < 0 ? md.length : afterHeading + 1;
  const rest = md.slice(start);
  const next = rest.search(/\n## /);
  const end = next < 0 ? md.length : start + next;
  return `${md.slice(0, start)}${body}${md.slice(end)}`;
}

function parseRecentBullets(md: string): string[] {
  const idx = md.indexOf("## Recently applied (last 20)");
  if (idx < 0) return [];
  const afterHeading = md.indexOf("\n", idx);
  const start = afterHeading < 0 ? md.length : afterHeading + 1;
  const rest = md.slice(start);
  const next = rest.search(/\n## /);
  const body = next < 0 ? rest : rest.slice(0, next);
  return body.split("\n").reduce<string[]>((bullets, line) => {
    if (line.startsWith("- ")) {
      bullets.push(line);
      return bullets;
    }
    if (line.trim() && bullets.length > 0) {
      bullets[bullets.length - 1] += `\n${line}`;
    }
    return bullets;
  }, []);
}

function sectionInsertAt(md: string, headingIdx: number): number {
  const afterHeading = md.indexOf("\n", headingIdx);
  const searchFrom = afterHeading < 0 ? md.length : afterHeading + 1;
  const rest = md.slice(searchFrom);
  // An empty section is a heading immediately followed by another heading.
  if (rest.startsWith("##")) return searchFrom;
  const next = rest.search(/\n##/);
  return next < 0 ? md.length : searchFrom + next;
}

interface LedgerEntry {
  ts?: string;
  agent?: string;
  agents?: string[];
  iteration?: number;
  iterations?: number[];
  kind?: string;
  topic?: string;
  forAgents?: string[];
  insight?: string;
  action?: string;
  confidence?: string;
  status?: string;
  evidence?: string;
  stage?: string;
}
