import { describe, it, expect } from "vitest";
import { AGENT_TOOL_NAMES } from "../../src/social/types";
import { TOOL_SCHEMAS, isKnownTool, buildToolSet } from "../../src/social/agent/toolRegistry";

describe("toolRegistry (AC-20)", () => {
  it("exposes exactly 18 named tools", () => {
    expect(AGENT_TOOL_NAMES).toHaveLength(18);
  });

  it("has a Zod schema for every tool name", () => {
    for (const name of AGENT_TOOL_NAMES) {
      expect(TOOL_SCHEMAS[name]).toBeDefined();
      expect(isKnownTool(name)).toBe(true);
    }
  });

  it("rejects unknown tool names", () => {
    expect(isKnownTool("run_raw_sql")).toBe(false);
    expect(isKnownTool("delete_everything")).toBe(false);
  });

  it("buildToolSet returns tools without execute handlers", () => {
    const tools = buildToolSet();
    for (const name of AGENT_TOOL_NAMES) {
      const t = tools[name] as { execute?: unknown };
      expect(t).toBeDefined();
      expect(t.execute).toBeUndefined();
    }
  });
});
