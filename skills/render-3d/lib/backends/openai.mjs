// OpenAI-compatible code-generation backend.
// Reads OPENAI_API_KEY (required), RENDER_3D_MODEL and RENDER_3D_BASE_URL
// (optional). Any OpenAI-compatible endpoint works. Model routing/tiering
// across providers is one-body issue #8's job (leeran7/one-body#8) — this stays a thin adapter.
import { SYSTEM_PROMPT } from "../system-prompt.mjs";
import { validateContract } from "../scaffold.mjs";

export const name = "openai";

// Placeholder default until leeran7/one-body#8 lands tiered routing. Override with
// RENDER_3D_MODEL if your account uses a different model id.
const DEFAULT_MODEL = "gpt-5";

function userMessage({ prompt, placement, style, budget }) {
  return [
    `Placement: ${placement}`,
    `Performance budget: ${budget}`,
    style ? `Style constraints: ${style}` : null,
    ``,
    `Visual description:`,
    prompt,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function stripFences(text) {
  const m = text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

export async function generateSceneCode(request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RENDER_3D_BACKEND=openai but OPENAI_API_KEY is not set. " +
        "Set it, point RENDER_3D_BASE_URL at an OpenAI-compatible endpoint, " +
        "or use RENDER_3D_BACKEND=stub."
    );
  }
  const baseUrl = (process.env.RENDER_3D_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.RENDER_3D_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage(request) },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`model backend ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("model backend returned no content");
  const code = stripFences(raw);
  const check = validateContract(code);
  if (!check.ok) {
    throw new Error(`generated code failed contract: ${check.errors.join("; ")}`);
  }
  return { code };
}
