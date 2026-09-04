import { describe, it, expect } from "vitest";
import { dispatchTool } from "../../src/social/agent/dispatch";

describe("dispatch (AC-21)", () => {
  it("rejects unknown tools", async () => {
    const result = await dispatchTool("run_arbitrary_query", {}, { uid: "admin-1" });
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toMatch(/Unknown tool/);
  });

  it("rejects calls without an admin identity", async () => {
    const result = await dispatchTool("get_social_accounts", {}, { uid: "" });
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toMatch(/authenticated admin/);
  });

  it("validates tool input via Zod schema", async () => {
    const result = await dispatchTool("create_content_idea", { prompt: "", platforms: [] }, { uid: "admin-1" });
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toMatch(/Invalid arguments/);
  });
});
