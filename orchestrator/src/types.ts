import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "..", "..");
export const LOOP_DIR = join(REPO_ROOT, "loop");
export const HANDOFFS_DIR = join(LOOP_DIR, "handoffs");
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

export interface Handoff {
  agent: string;
  status: HandoffStatus;
  summary: string;
  timestamp: string;
  goal?: string;
  artifacts?: string[];
  exitCriteria?: Record<string, boolean>;
  feedback?: HandoffFeedback[];
  nextStage?: string;
  loopBackTo?: string;
  parent?: string;
}

export interface LoopState {
  goal: string;
  currentStage: Stage;
  iteration: number;
  maxIterations: number;
  completedStages: Stage[];
  status: "running" | "paused" | "complete";
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

export async function readState(): Promise<LoopState> {
  const raw = await readFile(STATE_PATH, "utf-8");
  return JSON.parse(raw) as LoopState;
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
    status: "running",
  };
  await mkdir(HANDOFFS_DIR, { recursive: true });
  await writeState(state);
  return state;
}

export async function loadAgentPrompt(stage: Stage): Promise<string> {
  const path = join(AGENTS_DIR, `${stage}.md`);
  return readFile(path, "utf-8");
}

export async function latestHandoff(stage: Stage): Promise<Handoff | null> {
  await mkdir(HANDOFFS_DIR, { recursive: true });
  const files = await readdir(HANDOFFS_DIR);
  const matching = files
    .filter((f) => f.startsWith(`${stage}-`) && f.endsWith(".json"))
    .sort()
    .reverse();
  if (matching.length === 0) return null;
  const raw = await readFile(join(HANDOFFS_DIR, matching[0]), "utf-8");
  return JSON.parse(raw) as Handoff;
}

export async function readClosedLoopSkill(): Promise<string> {
  const skillPath = join(REPO_ROOT, "skills", "closed-loop", "SKILL.md");
  const stagesPath = join(REPO_ROOT, "skills", "closed-loop", "stages.md");
  const handoffsPath = join(REPO_ROOT, "skills", "closed-loop", "handoffs.md");
  const [skill, stages, handoffs] = await Promise.all([
    readFile(skillPath, "utf-8"),
    readFile(stagesPath, "utf-8"),
    readFile(handoffsPath, "utf-8"),
  ]);
  return `${skill}\n\n---\n\n${stages}\n\n---\n\n${handoffs}`;
}
