/**
 * The core flows, tapped through end to end at phone size (lib/flow.ts).
 *
 * - Taps from the start screen to the goal go through the baseline, so a
 *   flow that gets longer fails, and one that gets shorter must lower it
 *   (the plan's targets: run start 1 tap for a returning player, 2 on level 1).
 * - Problems (dead end, blocked tap, broken promise) must match KNOWN_BROKEN
 *   exactly: a new problem fails, and so does a fixed one still listed, so
 *   the fix PR removes its entry.
 */

import { test, expect, type Page } from "@playwright/test";
import { CHECKOUT_URL, isolate, openApp, prepareApp } from "./lib/app";
import { baselineKey, readBaseline, writeObserved } from "./lib/baseline";
import { baselineDiff } from "./lib/checks";
import { Flow } from "./lib/flow";
import { FLOW_IDS, KNOWN_BROKEN } from "./surfaces";

// An uncaught error on the way fails the flow, whatever it reached.
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }, info) => {
  test.skip(info.project.name !== "phone", "Flows are measured once, at phone size.");
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
});

const WEB_URL = process.env.UX_WEB_URL ?? "http://localhost:3100";
const only = process.env.UX_SURFACES ?? "all";
const baseline = readBaseline();

function finish(flow: Flow, name: (typeof FLOW_IDS)[number], info: { project: { name: string } }) {
  expect(pageErrors.get(flow.page) ?? [], "Uncaught errors during the flow").toEqual([]);
  const key = baselineKey(info.project.name, `flow-${name}`);
  const { taps, problems } = flow.result();
  const counts: Record<string, number> = taps === null ? {} : { "flow/taps": taps };
  writeObserved(key, counts);
  const known = (KNOWN_BROKEN[name] ?? []).map((k) => k.problem).sort();
  expect(problems, `The ${name} flow's problems changed. A new one is a regression; a fixed one leaves KNOWN_BROKEN.`).toEqual(known);
  expect(baselineDiff(counts, baseline[key]), `The ${name} flow's tap count changed. Longer is a regression; if it got shorter run pnpm ux:baseline.`).toEqual([]);
}

const btn = (page: Page, name: RegExp) => page.getByRole("button", { name });

test.describe("app", () => {
  test.skip(only === "web", "UX_SURFACES=web");

  test("guest to sign-in", async ({ page }, info) => {
    await prepareApp(page, "signed-out", { onboarded: false });
    await openApp(page, "/");
    const flow = new Flow(page);
    await flow.tap(btn(page, /continue as guest/i));
    // Older builds sent a new guest through a tutorial and a map tour first.
    for (let i = 0; i < 3; i++) {
      if (!(await flow.tapAny([btn(page, /skip tutorial/i), btn(page, /skip tour/i)]))) break;
    }
    if (await flow.reached(btn(page, /^sign in$/i))) {
      await flow.tap(btn(page, /^sign in$/i));
      await flow.reached(btn(page, /continue with apple/i));
    }
    finish(flow, "app-guest-to-signin", info);
  });

  test("start a run from the level map", async ({ page }, info) => {
    await prepareApp(page, "signed-in");
    await openApp(page, "/");
    const flow = new Flow(page);
    // The map's PLAY starts the level itself (plan D3); its card opens only from a floor.
    await flow.tap(btn(page, /^play level 1$/i));
    const onward = [btn(page, /let.s climb/i), btn(page, /^start$/i)];
    for (let i = 0; i < 5 && !(await btn(page, /^jump$/i).first().isVisible()); i++) {
      if (!(await flow.tapAny(onward))) break;
    }
    await flow.reached(btn(page, /^jump$/i));
    finish(flow, "app-run-start", info);
  });

  test("out of lives: PLAY offers the wait and a practice run", async ({ page }, info) => {
    await prepareApp(page, "signed-in", { outOfLives: true });
    await openApp(page, "/");
    const flow = new Flow(page);
    await flow.tap(btn(page, /^play level 11$/i));
    // The card says when the next life comes; without that it is a dead end.
    const sheet = page.getByRole("dialog");
    if (!(await sheet.getByText(/next life in \d+:\d\d/i).first().isVisible().catch(() => false))) flow.flag("dead-end");
    await flow.tap(sheet.getByRole("button", { name: /^practice this level$/i }));
    await flow.reached(btn(page, /^start$/i));
    finish(flow, "app-out-of-lives", info);
  });

  test("buy gems from the shop", async ({ page, context }, info) => {
    await prepareApp(page, "signed-in");
    await openApp(page, "/shop");
    const flow = new Flow(page);
    // Checkout opens in a new browser window (window.open on the web, the
    // in-app browser on a device), so watch the whole context for it.
    const checkout = context
      .waitForEvent("request", { predicate: (r) => r.url().startsWith(CHECKOUT_URL), timeout: 15_000 })
      .then(() => true, () => false);
    await flow.tap(btn(page, /^get gems$/i));
    await flow.tap(btn(page, /^buy /i));
    if (!(await checkout)) flow.flag("dead-end");
    finish(flow, "app-buy-gems", info);
  });

  test("open the Daily Climb and come back", async ({ page }, info) => {
    await prepareApp(page, "signed-in");
    await openApp(page, "/");
    const flow = new Flow(page);
    await flow.tap(btn(page, /^daily climb$/i));
    if (await flow.reached(btn(page, /^start daily$/i))) {
      // Leave without playing, the way a player who only wanted a look would.
      if (!(await flow.tapAny([btn(page, /^back( to home)?$/i), btn(page, /^close$/i)]))) flow.flag("dead-end");
      await flow.reached(async () => ["", "#/"].includes(new URL(page.url()).hash) && !(await btn(page, /^start daily$/i).first().isVisible()));
    }
    finish(flow, "app-daily", info);
  });

  test("challenge a friend from Versus", async ({ page }, info) => {
    await prepareApp(page, "signed-in");
    await openApp(page, "/");
    const flow = new Flow(page);
    await flow.tap(btn(page, /^versus$/i));
    if (!(await flow.tapAny([btn(page, /challenge/i), page.getByRole("link", { name: /challenge/i })]))) flow.flag("dead-end");
    await flow.reached(
      async () => new URL(page.url()).hash.startsWith("#/challenge") && (await page.getByRole("heading", { name: /^challenge$/i }).first().isVisible()),
    );
    finish(flow, "app-challenge", info);
  });
});

test.describe("web", () => {
  test.skip(only === "app", "UX_SURFACES=app");

  test("landing hero to a playable page", async ({ page }, info) => {
    await isolate(page);
    await page.goto(`${WEB_URL}/`, { waitUntil: "load" });
    const flow = new Flow(page);
    const promisesNoAccount = await page.getByText(/no account/i).first().isVisible().catch(() => false);
    // The hero is the first section of the landing; its filled button is its first visible link.
    await flow.tap(page.locator("main section").first().locator("a[href]").filter({ visible: true, hasText: /\w/ }));
    await page.waitForLoadState("load");
    const signInWall = await page.getByText(/sign in to (play|get matched)/i).first().isVisible().catch(() => false);
    if (promisesNoAccount && signInWall) flow.flag("broken-promise");
    await flow.reached(
      async () => new URL(page.url()).pathname === "/play" && (await page.getByRole("heading", { name: /^play the climb$/i }).first().isVisible()) && !signInWall,
    );
    finish(flow, "web-hero-to-play", info);
  });
});
