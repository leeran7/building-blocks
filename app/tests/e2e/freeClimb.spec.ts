/**
 * Free climb entry + canvas size + tab-locked chrome.
 *
 * The navbar control must open the game, the play canvas must be allowed
 * to grow with the viewport, and switching Leaderboard ↔ Play must not
 * jump the tab band.
 */

import { test, expect, type Page } from "@playwright/test";

test("navbar Free climb opens the game", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("navigation").getByRole("link", { name: "Free climb" });
  if (!(await link.isVisible())) {
    test.skip(true, "Free climb is in the sm+ navbar");
  }
  await link.click();
  await expect(page).toHaveURL(/\/play\/?$/);
  await expect(page.getByTestId("climb-canvas")).toBeVisible();
});

test.describe("desktop play canvas", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("grows past the chrome-cramped laptop size", async ({ page }, info) => {
    if (info.project.name !== "chromium") test.skip();
    await page.goto("/play");
    const canvas = page.getByTestId("climb-canvas");
    await expect(canvas).toBeVisible();
    // Title/meta used to sit above the canvas and leave ~270–320px of width
    // on this viewport. Fill panel leftover-height yields a bit over 400px.
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return box?.width ?? 0;
      })
      .toBeGreaterThan(380);
  });
});

test.describe("mobile play canvas", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("uses the phone width instead of the 360 baseline", async ({ page }, info) => {
    if (info.project.name !== "chromium") test.skip();
    await page.goto("/play");
    const canvas = page.getByTestId("climb-canvas");
    await expect(canvas).toBeVisible();
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return box?.width ?? 0;
      })
      .toBeGreaterThan(350);
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return box?.height ?? 0;
      })
      .toBeGreaterThan(600);
  });
});

test.describe("tab band lock desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("switching Leaderboard and Play does not jump the tab band", async ({
    page,
  }, info) => {
    if (info.project.name !== "chromium") test.skip();
    await assertTabBandLocked(page);
  });
});

test.describe("tab band lock mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("switching Leaderboard and Play does not jump the tab band", async ({
    page,
  }, info) => {
    if (info.project.name !== "chromium") test.skip();
    await assertTabBandLocked(page);
  });
});

async function tablistBox(page: Page) {
  const tablist = page.getByRole("tablist", { name: "Free stack sections" });
  await expect(tablist).toBeVisible();
  const box = await tablist.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function assertTabBandLocked(page: Page) {
  await page.goto("/climb");
  const climbBox = await tablistBox(page);

  await page.getByRole("tab", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play\/?$/);
  const playBox = await tablistBox(page);

  expect(Math.abs(climbBox.y - playBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(climbBox.height - playBox.height)).toBeLessThanOrEqual(1);

  await page.getByRole("tab", { name: "Leaderboard" }).click();
  await expect(page).toHaveURL(/\/climb\/?$/);
  const backBox = await tablistBox(page);

  expect(Math.abs(playBox.y - backBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(playBox.height - backBox.height)).toBeLessThanOrEqual(1);
}
