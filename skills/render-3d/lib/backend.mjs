// Pluggable model backend factory.
// RENDER_3D_BACKEND=openai|codex|stub. Defaults to openai when OPENAI_API_KEY
// is set, otherwise stub (deterministic, offline). codex runs the signed-in
// Codex CLI (a ChatGPT subscription works) and is only used when named.
// Backends export: { name, generateSceneCode({prompt, placement, style, budget}) -> {code} }
export async function createBackend(name) {
  const which =
    name ||
    process.env.RENDER_3D_BACKEND ||
    (process.env.OPENAI_API_KEY ? "openai" : "stub");
  if (which === "openai") return import("./backends/openai.mjs");
  if (which === "codex") return import("./backends/codex.mjs");
  if (which === "stub") return import("./backends/stub.mjs");
  throw new Error(
    `unknown RENDER_3D_BACKEND "${which}" (expected "openai", "codex" or "stub")`
  );
}

export function backendName() {
  return (
    process.env.RENDER_3D_BACKEND ||
    (process.env.OPENAI_API_KEY ? "openai" : "stub")
  );
}
