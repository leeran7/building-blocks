import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Handoff } from "./types.js";

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

export async function persistHandoffLearnings(
  handoff: Handoff,
  loopDir: string,
): Promise<void> {
  const learnings = handoff.learnings ?? [];
  if (learnings.length === 0) return;

  await mkdir(loopDir, { recursive: true });
  const jsonlPath = join(loopDir, "learnings.jsonl");
  let existing = "";
  try {
    existing = await readFile(jsonlPath, "utf-8");
  } catch {
    existing = "";
  }

  const lines: string[] = [];
  for (const learning of learnings) {
    if (learning.insight && existing.includes(learning.insight)) continue;
    lines.push(
      JSON.stringify({
        ts: handoff.timestamp,
        agent: handoff.agent,
        kind: learning.kind ?? "lesson",
        topic: learning.topic ?? "general",
        forAgents: learning.forAgents,
        insight: learning.insight,
        action: learning.action,
        confidence: learning.confidence ?? "medium",
        status: "open",
      }),
    );
  }
  if (lines.length === 0) return;
  await appendFile(jsonlPath, `${lines.join("\n")}\n`);
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

  let jsonl = "";
  try {
    jsonl = await readFile(jsonlPath, "utf-8");
  } catch {
    await writeFile(mdPath, md);
    return;
  }

  const entries = jsonl
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as {
          status?: string;
          insight?: string;
          action?: string;
          forAgents?: string[];
        };
      } catch {
        return null;
      }
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.status === "open"),
    );

  const stamp = `_Last curated: ${new Date().toISOString()} by orchestrator retro (iteration ${iteration})._`;
  let nextMd = md.includes("_Last curated:")
    ? md.replace(/_Last curated:.*_/, stamp)
    : `${stamp}\n\n${md}`;

  if (entries.length > 0) {
    const block = entries
      .map(
        (entry) =>
          `- [${(entry.forAgents ?? ["all"]).join(", ")}] ${entry.insight} → ${entry.action}`,
      )
      .join("\n");
    if (nextMd.includes("## Recently applied (last 20)")) {
      nextMd = nextMd.replace(
        "## Recently applied (last 20)",
        `## Recently applied (last 20)\n${block}`,
      );
    } else {
      nextMd = `${nextMd}\n\n${block}\n`;
    }
  }

  await writeFile(mdPath, nextMd);

  const folded = jsonl
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const obj = JSON.parse(line) as { status?: string };
        if (obj.status === "open") obj.status = "curated";
        return JSON.stringify(obj);
      } catch {
        return line;
      }
    })
    .join("\n");
  await writeFile(jsonlPath, folded ? `${folded}\n` : "");
}

export async function runRetro(
  loopDir: string,
  handoffs: Handoff[],
  iteration: number,
): Promise<void> {
  await mkdir(loopDir, { recursive: true });
  for (const handoff of handoffs) {
    await persistHandoffLearnings(handoff, loopDir);
  }
  await foldLearnings(loopDir, iteration);
}

export async function loadLearningsExcerpt(loopDir: string): Promise<string> {
  try {
    const md = await readFile(join(loopDir, "learnings.md"), "utf-8");
    return md.slice(0, 8000);
  } catch {
    return "(no learnings yet — create loop/learnings.md on first run)";
  }
}
