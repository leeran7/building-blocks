/**
 * LLM provider factory (R10/Q2, ADR: Vercel AI SDK). Provider-swappable —
 * changing AI_MODEL or adding a different `@ai-sdk/*` provider needs no
 * change to any calling code, only this file and an env var.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

let cachedModel: LanguageModel | null = null;

export function getLanguageModel(): LanguageModel {
  if (cachedModel) return cachedModel;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured — the AI agent/content generation is unavailable");
  }
  const openai = createOpenAI({ apiKey });
  const modelName = process.env.AI_MODEL || "gpt-4o-mini";
  cachedModel = openai(modelName);
  return cachedModel;
}

export function isLlmConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
