// Codex CLI backend: generates scene code through `codex exec`, so it runs on
// whatever account the local Codex CLI is signed in with, including a ChatGPT
// subscription (`codex login`). No API key is read or stored here.
// RENDER_3D_CODEX_BIN overrides the binary; RENDER_3D_MODEL picks the model.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYSTEM_PROMPT } from "../system-prompt.mjs";
import { validateContract } from "../scaffold.mjs";
import { userMessage, stripFences } from "./openai.mjs";

export const name = "codex";

const TIMEOUT_MS = 300_000;

// The prompt can come from an MCP caller, so the agent gets no tools that
// could read the disk or reach out: no shell, browser, apps or plugins.
export const DISABLED_FEATURES = [
  "shell_tool", "unified_exec", "apps", "plugins", "browser_use",
  "browser_use_external", "computer_use", "in_app_browser", "image_generation",
];

// Codex is an agent; this keeps it to a single text answer.
const AGENT_RULES = `You are being used as a plain code generator.
Do not run commands, read files, or edit files. Reply with only the module.`;

export function codexArgs({ workDir, outFile, model }) {
  return [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    // No user MCP servers, hooks or exec rules; auth still comes from CODEX_HOME.
    "--ignore-user-config",
    "--ignore-rules",
    "--sandbox", "read-only",
    ...DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    "--color", "never",
    "-C", workDir,
    "-o", outFile,
    ...(model ? ["-m", model] : []),
    "-", // prompt on stdin
  ];
}

function run(bin, args, input, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        e.code === "ENOENT"
          ? new Error(
              `RENDER_3D_BACKEND=codex but "${bin}" was not found. Install the Codex CLI ` +
                "(npm i -g @openai/codex) and run `codex login`, or set RENDER_3D_CODEX_BIN."
            )
          : e
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stderr });
    });
    child.stdin.end(input);
  });
}

export async function generateSceneCode(request) {
  const bin = process.env.RENDER_3D_CODEX_BIN || "codex";
  const workDir = await mkdtemp(join(tmpdir(), "render-3d-codex-"));
  const outFile = join(workDir, "answer.txt");
  try {
    const prompt = `${SYSTEM_PROMPT}\n\n${AGENT_RULES}\n\n${userMessage(request)}`;
    const args = codexArgs({ workDir, outFile, model: process.env.RENDER_3D_MODEL });
    const { code, signal, stderr } = await run(bin, args, prompt, workDir);
    if (code !== 0) {
      const why = signal ? `killed (${signal})` : `exit ${code}`;
      const hint = /log ?in|auth|401/i.test(stderr) ? " Run `codex login` first." : "";
      throw new Error(`codex exec ${why}.${hint} ${stderr.trim().slice(-300)}`);
    }
    const raw = await readFile(outFile, "utf8").catch(() => "");
    if (!raw.trim()) throw new Error("codex exec returned no answer");
    const sceneCode = stripFences(raw);
    const check = validateContract(sceneCode);
    if (!check.ok) {
      throw new Error(`generated code failed contract: ${check.errors.join("; ")}`);
    }
    return { code: sceneCode };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
