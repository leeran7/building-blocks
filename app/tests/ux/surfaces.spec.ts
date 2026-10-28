/**
 * Visits every surface in surfaces.ts at the project's viewport, waits for it
 * to render, runs the UX checks, saves a screenshot, and fails when a rule's
 * count differs from the baseline (lib/baseline.ts): higher is a regression,
 * lower means the baseline must come down with the fix.
 *
 * Minimum hit area: 44 px in the app (Apple HIG, Android 48 dp), 24 px on the
 * web (WCAG 2.2 SC 2.5.8). The keyboard walk runs at desktop size only, where
 * keyboards are used; the zoom check runs at phone sizes only.
 */

import { test, expect } from "@playwright/test";
import { APP_URL, isolate, prepareApp } from "./lib/app";
import { baselineKey, readBaseline, writeObserved } from "./lib/baseline";
import {
  axeFindings,
  countByRule,
  focusFindings,
  baselineDiff,
  landmarkFindings,
  overflowFindings,
  stretchFindings,
  targetFindings,
  zoomFindings,
  type Finding,
} from "./lib/checks";
import { APP_SURFACES, WEB_SURFACES, type Surface } from "./surfaces";

const WEB_URL = process.env.UX_WEB_URL ?? "http://localhost:3100";
const only = process.env.UX_SURFACES ?? "all";
const surfaces: Surface[] = [...(only === "web" ? [] : APP_SURFACES), ...(only === "app" ? [] : WEB_SURFACES)];
const baseline = readBaseline();

for (const surface of surfaces) {
  test(`${surface.kind} ${surface.id}`, async ({ page }, info) => {
    const project = info.project.name;
    // An uncaught error usually means a screen that failed to render.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (surface.kind === "app") {
      await prepareApp(page, surface.user ?? "signed-in");
      await page.goto(`${APP_URL}#${surface.route}`);
    } else {
      await isolate(page);
      const res = await page.goto(`${WEB_URL}${surface.route}`, { waitUntil: "load" });
      expect(res?.status(), `${surface.route} did not load`).toBe(200);
    }
    await surface.open?.(page);
    await expect(surface.ready(page).first(), `${surface.kind} ${surface.id} did not render`).toBeVisible({ timeout: 20_000 });
    // Let entrance transitions finish (motion is reduced, not removed).
    await page.waitForTimeout(600);
    expect(errors, "Uncaught errors on the page").toEqual([]);

    await page.screenshot({ path: `test-results/ux/screens/${project}/${surface.kind}-${surface.id}.png` });

    const findings: Finding[] = [
      ...(await axeFindings(page)),
      ...(await targetFindings(page, surface.kind === "app" ? 44 : 24)),
      ...(await overflowFindings(page)),
      ...(project === "desktop" ? await stretchFindings(page) : []),
      ...(project === "desktop" ? [] : await zoomFindings(page)),
      ...(project === "desktop" ? await focusFindings(page, 20) : []),
      ...(surface.kind === "web" ? await landmarkFindings(page) : []),
    ];

    const key = baselineKey(project, `${surface.kind}-${surface.id}`);
    const counts = countByRule(findings);
    writeObserved(key, counts);
    expect(errors, "Uncaught errors while checking the page").toEqual([]);
    info.annotations.push(...findings.map((f) => ({ type: `${f.check}/${f.rule}`, description: f.where })));

    expect(baselineDiff(counts, baseline[key]), `UX findings on ${key} differ from the baseline. A regression must be fixed; if a count went down run pnpm ux:baseline.`).toEqual([]);
  });
}
