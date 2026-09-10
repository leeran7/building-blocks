/**
 * Launch surface tests (Playwright).
 *
 * Covers the current public surfaces: the landing page, the /rules page
 * (free climb + 1v1 paid battles), and the brand OG image.
 */

import { test, expect } from "@playwright/test";

test("landing page renders the hero and free-duel social proof", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.locator("body")).toContainText("Free duels always on");
});

test("/rules explains the free climb and 1v1 paid battles", async ({ page }) => {
  await page.goto("/rules");
  const body = page.locator("body");
  await expect(body).toContainText("The free climb");
  await expect(body).toContainText("1v1 paid battles");
  // The winner-takes-the-pot rule, driven by the real rake config.
  await expect(body).toContainText("payout");
  await expect(body).toContainText("rake");
});

test("brand OG image meta tag exists on the homepage", async ({ page }) => {
  await page.goto("/");
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(ogImage).toBeTruthy();
  expect(ogImage).toContain("/api/og");
});
