import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "..", "..");
export const LOOP_DIR = join(REPO_ROOT, "loop");
export const HANDOFFS_DIR = join(LOOP_DIR, "handoffs");
export const LEGACY_HANDOFFS_DIR = join(REPO_ROOT, ".cursor", "loop", "handoffs");
export const AGENTS_DIR = join(REPO_ROOT, "agents");
export const STATE_PATH = join(LOOP_DIR, "state.json");

export type HandoffStatus = "success" | "blocked" | "failed" | "needs_revision";

export interface HandoffFeedback {
  severity: "critical" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  action?: string;
}

export interface HandoffLearning {
  topic?: string;
  forAgents: string[];
  kind?: "lesson" | "pattern" | "pitfall" | "metric" | "question";
  insight: string;
  action: string;
  confidence?: "low" | "medium" | "high";
}

export interface Handoff {
  agent: string;
  status: HandoffStatus;
  summary: string;
  timestamp: string;
  goal?: string;
  artifacts?: string[];
  exitCriteria?: Record<string, boolean>;
  feedback?: HandoffFeedback[];
  findings?: HandoffFinding[];
  learnings?: HandoffLearning[];
  nextStage?: string;
  loopBackTo?: string;
  parent?: string;
}

export interface HandoffFinding {
  severity: "critical" | "warning" | "info";
  location?: string;
  issue?: string;
  message?: string;
  fix?: string;
  owasp?: string;
  reproduction?: string;
}

export const HANDOFF_STATUSES: HandoffStatus[] = [
  "success",
  "blocked",
  "failed",
  "needs_revision",
];

export interface LoopState {
  goal: string;
  currentStage: Stage;
  iteration: number;
  maxIterations: number;
  completedStages: Stage[];
  dispatched: Stage[];
  requiredTeam: Stage[];
  status: "running" | "paused" | "complete";
  pauseReason?: string;
  startedAt?: string;
}

export type Stage =
  | "product-spec"
  | "architect"
  | "design-ux"
  | "implementer"
  | "verifier"
  | "reviewer"
  | "security-reviewer"
  | "qa-acceptance"
  | "integrator"
  | "devops"
  | "release"
  | "monitor"
  | "docs"
  | "debugger";

/** Required team members the orchestrator must actually dispatch. Cannot skip. */
export const REQUIRED_TEAM: Stage[] = [
  "product-spec",
  "architect",
  "implementer",
  "verifier",
  "reviewer",
  "security-reviewer",
  "qa-acceptance",
  "integrator",
];

/**
 * Sequential backbone. `security-reviewer` is not listed here because it
 * runs in parallel with `reviewer` — see `stagesToDispatch`.
 */
export const REQUIRED_SEQUENCE: Stage[] = [
  "product-spec",
  "architect",
  "implementer",
  "verifier",
  "reviewer",
  "qa-acceptance",
  "integrator",
  "release",
  "monitor",
];

export const PRIMARY_PIPELINE: Stage[] = [
  "product-spec",
  "architect",
  "implementer",
  "verifier",
  "reviewer",
  "security-reviewer",
  "qa-acceptance",
  "integrator",
  "release",
  "monitor",
];

export function normalizeState(state: LoopState): LoopState {
  return {
    ...state,
    maxIterations: state.maxIterations ?? 10,
    requiredTeam: state.requiredTeam ?? [...REQUIRED_TEAM],
    dispatched: state.dispatched ?? [...(state.completedStages ?? [])],
  };
}

export async function readState(): Promise<LoopState> {
  const raw = await readFile(STATE_PATH, "utf-8");
  return normalizeState(JSON.parse(raw) as LoopState);
}

export async function writeState(state: LoopState): Promise<void> {
  await mkdir(LOOP_DIR, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

export async function initState(goal: string): Promise<LoopState> {
  const state: LoopState = {
    goal,
    currentStage: "product-spec",
    iteration: 1,
    maxIterations: 10,
    completedStages: [],
    dispatched: [],
    requiredTeam: [...REQUIRED_TEAM],
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await mkdir(HANDOFFS_DIR, { recursive: true });
  await writeState(state);
  return state;
}

const PROTOCOL_PATH = join(REPO_ROOT, "skills", "closed-loop", "protocol.md");
const PROTOCOL_START = "<!-- closed-loop:protocol -->\n";
const PROTOCOL_END = "<!-- /closed-loop:protocol -->\n";

function stripProtocol(body: string): string {
  return body.replace(
    /<!-- closed-loop:protocol -->[\s\S]*?<!-- \/closed-loop:protocol -->\n*/g,
    "",
  );
}

export async function loadAgentPrompt(stage: Stage): Promise<string> {
  const [role, protocol] = await Promise.all([
    readFile(join(AGENTS_DIR, `${stage}.md`), "utf-8"),
    readFile(PROTOCOL_PATH, "utf-8"),
  ]);
  const stripped = stripProtocol(role).replace(/^\n+/, "");
  return `${PROTOCOL_START}${protocol.trim()}\n${PROTOCOL_END}\n${stripped}`;
}

function agentMatchesStage(handoff: Handoff, stage: Stage): boolean {
  const names = (handoff.agent ?? "")
    .split("+")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.includes(stage);
}

export async function latestHandoff(
  stage: Stage,
  opts?: { notBefore?: string; dirs?: string[] },
): Promise<Handoff | null> {
  const dirs = opts?.dirs ?? [HANDOFFS_DIR, LEGACY_HANDOFFS_DIR];
  for (const dir of dirs) {
    const found = await collectHandoffsInDir(dir, stage, opts?.notBefore);
    if (found.length > 0) {
      found.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
      return found[0];
    }
  }
  return null;
}

async function collectHandoffsInDir(
  dir: string,
  stage: Stage,
  notBefore?: string,
): Promise<Handoff[]> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const found: Handoff[] = [];
  for (const file of files) {
    if (!file.startsWith(`${stage}-`) || !file.endsWith(".json")) continue;
    const path = join(dir, file);
    try {
      const raw = await readFile(path, "utf-8");
      const handoff = JSON.parse(raw) as Handoff;
      if (!agentMatchesStage(handoff, stage)) continue;
      if (notBefore) {
        if (!handoff.timestamp || handoff.timestamp < notBefore) continue;
        const fileStat = await stat(path);
        if (fileStat.mtime.toISOString() < notBefore) continue;
      }
      found.push(handoff);
    } catch {
      continue;
    }
  }
  return found;
}

export async function latestUpstreamHandoff(
  state: LoopState,
): Promise<Handoff | null> {
  const priorStage = state.completedStages.at(-1);
  if (priorStage) {
    const prior = await latestHandoff(priorStage);
    if (prior) return prior;
  }
  return latestHandoff(state.currentStage);
}

export async function readClosedLoopSkill(): Promise<string> {
  const skillDir = join(REPO_ROOT, "skills", "closed-loop");
  const [skill, stages, handoffs, team, learning] = await Promise.all([
    readFile(join(skillDir, "SKILL.md"), "utf-8"),
    readFile(join(skillDir, "stages.md"), "utf-8"),
    readFile(join(skillDir, "handoffs.md"), "utf-8"),
    readFile(join(skillDir, "team.md"), "utf-8").catch(() => ""),
    readFile(join(skillDir, "learning-loop.md"), "utf-8"),
  ]);
  return [skill, stages, handoffs, team, learning].filter(Boolean).join("\n\n---\n\n");
}
