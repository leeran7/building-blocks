import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Handoff } from "./types.js";

/**
 * Lean learnings ledger: one short `loop/learnings.md`, no JSONL, no retro
 * fold/promote. Two sections — durable Standing rules and recent Notes.
 * Agents read the top; they append at most a one-line note when they hit
 * something genuinely new. Prune aggressively; this file must stay cheap to read.
 */

const STANDING_HEADING = "## Standing rules (always apply)";
const NOTES_HEADING = "## Notes (recent — newest first)";
const NOTES_LIMIT = 30;
const EXCERPT_CAP = 2500;

export const EMPTY_LEDGER = `# Learnings

Keep this short. Standing rules are durable, always-apply lessons. Notes are
recent one-line findings. Prune aggressively — a ledger nobody reads is dead weight.

${STANDING_HEADING}

${NOTES_HEADING}
`;

export interface Learning {
  forAgents: string[];
  insight: string;
  action: string;
}

export function normalizeLearning(raw: unknown): Learning | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const insight = firstString(record, ["insight", "lesson", "message", "finding"]);
  const action = firstString(record, ["action", "recommendation", "fix", "do"]);
  if (!insight || !action) return null;
  const forAgents = firstStringArray(record, ["forAgents", "agents", "for"]) ?? ["all"];
  return { forAgents, insight, action };
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

function formatBullet(learning: Learning): string {
  return `- [${learning.forAgents.join(", ")}] ${learning.insight} → ${learning.action}`;
}

function bulletInsight(bullet: string): string {
  return bullet.replace(/^- \[[^\]]*\]\s*/, "").split(" → ")[0]?.trim() ?? bullet;
}

function bulletTargets(bullet: string): string[] {
  const tag = bullet.match(/^- \[([^\]]*)\]/)?.[1] ?? "all";
  return tag.split(",").map((agent) => agent.trim().toLowerCase());
}

function getSection(md: string, heading: string): string {
  const idx = md.indexOf(heading);
  if (idx < 0) return "";
  const start = md.indexOf("\n", idx);
  if (start < 0) return "";
  const rest = md.slice(start + 1);
  const next = rest.search(/\n## /);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

function setNotes(md: string, bullets: string[]): string {
  const body = bullets.length > 0 ? `${bullets.join("\n")}\n` : "";
  const idx = md.indexOf(NOTES_HEADING);
  if (idx < 0) return `${md.trimEnd()}\n\n${NOTES_HEADING}\n${body}`;
  const start = md.indexOf("\n", idx);
  const head = start < 0 ? md.length : start + 1;
  const rest = md.slice(head);
  const next = rest.search(/\n## /);
  const end = next < 0 ? md.length : head + next;
  return `${md.slice(0, head)}${body}${md.slice(end)}`;
}

async function readLedger(loopDir: string): Promise<string> {
  try {
    return await readFile(join(loopDir, "learnings.md"), "utf-8");
  } catch {
    return EMPTY_LEDGER;
  }
}

/** Append new handoff learnings to Notes (newest first), deduped and capped. */
export async function persistHandoffLearnings(
  handoff: Handoff,
  loopDir: string,
): Promise<void> {
  const incoming = (handoff.learnings ?? [])
    .map(normalizeLearning)
    .filter((l): l is Learning => l !== null);
  if (incoming.length === 0) return;

  await mkdir(loopDir, { recursive: true });
  const md = await readLedger(loopDir);
  const existing = getSection(md, NOTES_HEADING)
    .split("\n")
    .filter((line) => line.startsWith("- "));

  const seen = new Set(existing.map(bulletInsight));
  const fresh: string[] = [];
  for (const learning of incoming) {
    if (seen.has(learning.insight)) continue;
    seen.add(learning.insight);
    fresh.push(formatBullet(learning));
  }
  if (fresh.length === 0) return;

  const notes = [...fresh, ...existing].slice(0, NOTES_LIMIT);
  await writeFile(join(loopDir, "learnings.md"), setNotes(md, notes));
}

/** Persist every dispatched handoff's learnings. No fold, no promote. */
export async function runRetro(
  loopDir: string,
  handoffs: Handoff[],
  _iteration?: number,
): Promise<void> {
  await mkdir(loopDir, { recursive: true });
  for (const handoff of handoffs) {
    await persistHandoffLearnings(handoff, loopDir);
  }
}

/** Standing rules (always) + recent Notes, capped so it stays cheap to read. */
export async function loadLearningsExcerpt(loopDir: string): Promise<string> {
  let md: string;
  try {
    md = await readFile(join(loopDir, "learnings.md"), "utf-8");
  } catch {
    return "(no learnings yet — create loop/learnings.md on first run)";
  }
  const standing = getSection(md, STANDING_HEADING);
  const notes = getSection(md, NOTES_HEADING);
  const parts = [
    `${STANDING_HEADING}\n${standing}`.trim(),
    notes ? `${NOTES_HEADING}\n${notes}`.trim() : "",
  ].filter(Boolean);
  return (parts.join("\n\n") || md).slice(0, EXCERPT_CAP);
}

/** Standing rules plus the Notes tagged for this stage (or `all`). */
export async function loadLearningsForStage(
  loopDir: string,
  stage: string,
): Promise<string> {
  let md: string;
  try {
    md = await readFile(join(loopDir, "learnings.md"), "utf-8");
  } catch {
    return "(no learnings yet — create loop/learnings.md on first run)";
  }
  const standing = getSection(md, STANDING_HEADING);
  const stageKey = stage.toLowerCase();
  const notes = getSection(md, NOTES_HEADING)
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .filter((line) => {
      const targets = bulletTargets(line);
      return targets.includes("all") || targets.includes(stageKey);
    });

  const parts = [`${STANDING_HEADING}\n${standing}`.trim()];
  if (notes.length > 0) parts.push(`## Notes for ${stage}\n${notes.join("\n")}`);
  return parts.join("\n\n").slice(0, EXCERPT_CAP);
}
