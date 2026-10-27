/**
 * Proves each UX check goes red (.claude/rules/testing.md: a gate is not a
 * gate until it has been proven to fail). Each check runs on a page with a
 * planted violation and must report it, then on a clean page and must not.
 */

import { test, expect, type Page } from "@playwright/test";
import { readBaseline } from "./lib/baseline";
import { Flow } from "./lib/flow";
import { APP_SURFACES, FLOW_IDS, KNOWN_BROKEN, WEB_SURFACES } from "./surfaces";
import {
  axeFindings,
  baselineDiff,
  countByRule,
  focusFindings,
  landmarkFindings,
  overflowFindings,
  stretchFindings,
  targetFindings,
  zoomFindings,
} from "./lib/checks";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "The checks are viewport-independent; one run is enough.");
});

const page_ = (body: string, head = '<meta name="viewport" content="width=device-width, initial-scale=1">') =>
  `<!doctype html><html lang="en"><head>${head}<title>Fixture</title></head><body style="margin:0;background:#0a0a0c;color:#f4f2ec;font:16px sans-serif"><main>${body}</main></body></html>`;

const CLEAN = page_(`
  <h1>Clean</h1>
  <p>Text with an <a href="#x" style="color:#cbf24d">inline link</a> in it.</p>
  <style>button:focus-visible { outline: 2px solid #cbf24d; outline-offset: 2px }</style>
  <button style="width:48px;height:48px;color:#0a0a0c;background:#cbf24d;border:0">Go</button>
`);

async function set(page: Page, html: string) {
  await page.setContent(html);
}

test("axe reports low-contrast text, and nothing on the clean page", async ({ page }) => {
  await set(page, page_('<p style="color:#2a2a2e">Hard to read</p>'));
  expect((await axeFindings(page)).map((f) => f.rule)).toContain("color-contrast");
  await set(page, CLEAN);
  expect(await axeFindings(page)).toEqual([]);
});

test("target check reports a 20 px button, not an inline text link", async ({ page }) => {
  await set(page, page_('<button style="width:20px;height:20px">x</button>'));
  expect(await targetFindings(page, 24)).toHaveLength(1);
  await set(page, CLEAN);
  expect(await targetFindings(page, 44)).toEqual([]);
});

test("landmark check reports a missing main, two mains and no site header", async ({ page }) => {
  const rules = async () => (await landmarkFindings(page)).map((f) => f.rule).sort();
  await page.setContent("<!doctype html><title>F</title><div>No landmarks</div>");
  expect(await rules()).toEqual(["no-main", "no-site-header"]);
  await page.setContent("<!doctype html><title>F</title><nav>Site</nav><main>A</main><main>B</main>");
  expect(await rules()).toEqual(["many-main"]);
  // A nav inside main is page navigation, not the site header.
  await page.setContent("<!doctype html><title>F</title><main><nav>Tabs</nav></main>");
  expect(await rules()).toEqual(["no-site-header"]);
  // Footer link lists below main are no site header.
  await page.setContent("<!doctype html><title>F</title><main>A</main><footer><nav>Links</nav></footer>");
  expect(await rules()).toEqual(["no-site-header"]);
  await page.setContent('<!doctype html><title>F</title><div style="display:none"><nav>Site</nav></div><main>A</main>');
  expect(await rules()).toEqual([]);
});

test("focus check reports a control with no visible focus", async ({ page }) => {
  await set(page, page_('<button style="outline:none;width:48px;height:48px">A</button>'));
  expect((await focusFindings(page, 3)).map((f) => f.rule)).toContain("no-indicator");
  // Tailwind's outline-hidden: a transparent outline is no indicator either.
  await set(page, page_('<style>button:focus-visible { outline: 2px solid transparent }</style><button style="width:48px;height:48px">A</button>'));
  expect((await focusFindings(page, 3)).map((f) => f.rule)).toContain("no-indicator");
  await set(page, CLEAN);
  expect((await focusFindings(page, 3)).filter((f) => f.rule === "no-indicator")).toEqual([]);
  // A ring drawn by the wrapper (:focus-within) counts as an indicator.
  await set(page, page_('<style>button{outline:none} span:focus-within{box-shadow:0 0 0 2px #cbf24d}</style><span><button style="width:48px;height:48px">A</button></span>'));
  expect((await focusFindings(page, 3)).filter((f) => f.rule === "no-indicator")).toEqual([]);
});

test("focus check reports Tab leaving an open modal dialog", async ({ page }) => {
  await set(
    page,
    page_(`<button id="behind">Behind</button>
      <section role="dialog" aria-modal="true" aria-label="Sheet" style="position:fixed;inset:auto 0 0 0;height:200px;background:#222">
        <button id="inside">Inside</button>
      </section>`),
  );
  await page.focus("#inside");
  expect((await focusFindings(page, 3)).map((f) => f.rule)).toContain("escapes-dialog");
  // Focus falling back to the page itself has left the dialog too.
  await set(page, page_('<section role="dialog" aria-modal="true" aria-label="Sheet" style="height:200px"><p>No controls</p></section>'));
  expect((await focusFindings(page, 2)).map((f) => f.rule)).toContain("escapes-dialog");
});

test("zoom check reports user-scalable=no", async ({ page }) => {
  await set(page, page_("<p>x</p>", '<meta name="viewport" content="width=device-width, maximum-scale=1.0, user-scalable=no">'));
  expect(await zoomFindings(page)).toHaveLength(1);
  await set(page, page_("<p>x</p>", '<meta name="viewport" content="width=device-width, maximum-scale=0.8">'));
  expect(await zoomFindings(page)).toHaveLength(1);
  await set(page, page_("<p>x</p>", '<meta name="viewport" content="width=device-width, maximum-scale=5">'));
  expect(await zoomFindings(page)).toEqual([]);
  await set(page, CLEAN);
  expect(await zoomFindings(page)).toEqual([]);
});

test("overflow check reports sideways scroll", async ({ page }) => {
  await set(page, page_('<div style="width:3000px;height:10px"></div>'));
  expect(await overflowFindings(page)).toHaveLength(1);
  await set(page, CLEAN);
  expect(await overflowFindings(page)).toEqual([]);
});

test("stretch check reports a button wider than 720 px", async ({ page }) => {
  await set(page, page_('<button style="width:1300px;height:56px">Play</button>'));
  expect(await stretchFindings(page)).toHaveLength(1);
  await set(page, CLEAN);
  expect(await stretchFindings(page)).toEqual([]);
});

test("the baseline fails a count above or below what it allows, and passes an exact match", () => {
  const counts = countByRule([
    { check: "axe", rule: "color-contrast", where: "a" },
    { check: "axe", rule: "color-contrast", where: "b" },
  ]);
  expect(baselineDiff(counts, { "axe/color-contrast": 1 })).toEqual(["axe/color-contrast: 2 found, 1 allowed (regression)"]);
  expect(baselineDiff(counts, undefined)).toHaveLength(1);
  expect(baselineDiff(counts, { "axe/color-contrast": 3 })).toEqual(["axe/color-contrast: 2 found, 3 allowed (better: run pnpm ux:baseline)"]);
  expect(baselineDiff({}, { "target/under-44px": 1 })).toHaveLength(1);
  expect(baselineDiff(counts, { "axe/color-contrast": 2 })).toEqual([]);
});

test("every baseline key belongs to a surface or flow that still exists", () => {
  const ids = new Set([...APP_SURFACES, ...WEB_SURFACES].map((s) => `${s.kind}-${s.id}`).concat(FLOW_IDS.map((f) => `flow-${f}`)));
  const keys = Object.keys(readBaseline());
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.filter((k) => !["phone", "small", "desktop"].includes(k.split("|")[0]) || !ids.has(k.split("|")[1] ?? ""))).toEqual([]);
  expect(Object.keys(KNOWN_BROKEN).filter((k) => !(FLOW_IDS as readonly string[]).includes(k))).toEqual([]);
});

test("a flow reports a dead end, a blocked tap, and counts taps only when it arrives", async ({ page }) => {
  await set(page, page_(`<button id="go" onclick="document.getElementById('goal').hidden=false" style="width:48px;height:48px">Go</button><p id="goal" hidden>Arrived</p>`));
  const ok = new Flow(page, 0);
  await ok.tap(page.locator("#go"));
  await ok.reached(page.getByText("Arrived"), 1000);
  expect(ok.result()).toEqual({ taps: 1, problems: [] });

  await set(page, page_('<button id="go" style="width:48px;height:48px">Go</button><p>Nowhere</p>'));
  const lost = new Flow(page, 0);
  await lost.tap(page.locator("#go"));
  await lost.reached(page.getByText("Arrived"), 500);
  expect(lost.result()).toEqual({ taps: null, problems: ["dead-end"] });

  await set(page, page_('<button id="go" style="width:48px;height:48px">Go</button><div style="position:fixed;inset:0;background:#000"></div>'));
  const blocked = new Flow(page, 0);
  expect(await blocked.tap(page.locator("#go"))).toBe(false);
  expect(blocked.result().problems).toEqual(["blocked-tap"]);
});
