import { describe, it, expect } from "vitest";
import { canMoveToReadyForReview } from "../../src/social/services/approvalWorkflow";

describe("approvalWorkflow", () => {
  it("canMoveToReadyForReview blocks avoid-listed drafts", () => {
    expect(canMoveToReadyForReview({ blockedByAvoidTerm: false })).toBe(true);
    expect(canMoveToReadyForReview({ blockedByAvoidTerm: true })).toBe(false);
  });
});
