/**
 * Free climb entry + canvas size.
 *
 * The navbar control must open the game, and the play canvas must be allowed
 * to grow with the viewport instead of sitting at the 360×640 baseline.
 */

import { test, expect } from "@playwright/test";

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
    // Title/meta used to come back at min-height:560px and leave ~270–320px
    // of width on this viewport. After compact-always, height budget yields
    // a bit over 400px.
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
