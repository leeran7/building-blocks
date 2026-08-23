/**
 * Phase 7 Launch Surface Tests — AC-46 through AC-50 (Playwright)
 */

import { test, expect } from "@playwright/test";

// AC-46: Above-fold copy (5 mandatory statements)
test("AC-46: Homepage displays all 5 mandatory above-fold statements", async ({
  page,
}) => {
  await page.goto("/");

  // Wait for above-fold section
  const aboveFold = page.locator("[data-testid='above-fold-copy']");
  await expect(aboveFold).toBeVisible();

  // Statement 1: Altitude permanence
  const permanence = page.locator("[data-testid='copy-altitude-permanence']");
  await expect(permanence).toBeVisible();
  await expect(permanence).toContainText("permanent");

  // Statement 2: Ground mechanics
  const groundMechanics = page.locator("[data-testid='copy-ground-mechanics']");
  await expect(groundMechanics).toBeVisible();
  await expect(groundMechanics).toContainText("ground rises");

  // Statement 3: No-views-no-erosion
  const noErosion = page.locator("[data-testid='copy-no-views-no-erosion']");
  await expect(noErosion).toBeVisible();
  await expect(noErosion).toContainText("views");

  // Statement 4: Overtaking mechanism
  const overtaking = page.locator("[data-testid='copy-overtaking']");
  await expect(overtaking).toBeVisible();
  await expect(overtaking).toContainText("price of #1 falls");

  // Statement 5: No-deletion guarantee
  const noDeletion = page.locator("[data-testid='copy-no-deletion']");
  await expect(noDeletion).toBeVisible();
  await expect(noDeletion).toContainText("never deleted");
});

// AC-47: /rules page with formulas
test("AC-47: /rules page displays engine formulas with MAX_GROWTH=8 and season reset", async ({
  page,
}) => {
  await page.goto("/rules");

  // MAX_GROWTH = 8
  const maxGrowth = page.locator("[data-testid='rules-max-growth']");
  await expect(maxGrowth).toBeVisible();
  await expect(maxGrowth).toContainText("8");
  await expect(maxGrowth).toContainText("MAX_GROWTH");

  // DOUBLE_EVERY_K
  await expect(page.locator("body")).toContainText("DOUBLE_EVERY_K");
  await expect(page.locator("body")).toContainText("500");

  // 90-day season reset
  const seasonReset = page.locator("[data-testid='rules-season-reset']");
  await expect(seasonReset).toBeVisible();
  await expect(seasonReset).toContainText("90");

  // Growth formula
  const growthFormula = page.locator("[data-testid='rules-growth-formula']");
  await expect(growthFormula).toBeVisible();
  await expect(growthFormula).toContainText("MAX_GROWTH");
});

// AC-48: Dynamic OG image
test("AC-48: OG image meta tag exists on homepage", async ({ page }) => {
  await page.goto("/");

  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toBeTruthy();
  expect(ogImage).toContain("/api/og");
});

// AC-49: Admin hide (integration test — checks API contract)
test("AC-49: Admin hide endpoint requires auth", async ({ request }) => {
  // Without auth — should return 401
  const response = await request.post("/api/admin/hide", {
    data: { block_id: "test-block-id" },
  });
  expect(response.status()).toBe(401);
});

// AC-50: Admin auto-refund (integration test — checks API contract)
test("AC-50: Admin refund endpoint requires auth", async ({ request }) => {
  // Without auth — should return 401
  const response = await request.post("/api/admin/refund", {
    data: { block_id: "test-block-id" },
  });
  expect(response.status()).toBe(401);
});
