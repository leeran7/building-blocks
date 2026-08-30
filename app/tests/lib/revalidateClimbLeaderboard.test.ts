import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

import { revalidateClimbLeaderboard } from "../../src/lib/revalidateClimbLeaderboard";

describe("revalidateClimbLeaderboard", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it("revalidates the climb page and landing page", () => {
    revalidateClimbLeaderboard();
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/climb");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
