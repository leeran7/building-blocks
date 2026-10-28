/**
 * UX checks run against any page (app SPA or website). Each returns findings;
 * none of them throws, so one page can report every problem at once.
 *
 * The 8/10 bar these encode (plan "Doomstack to 8/10", "What 8/10 means"):
 * zero serious/critical axe findings, hit areas of at least 44 px in the app
 * and 24 px on the web, a visible keyboard focus on every control, sheets
 * that keep focus inside, zoom allowed, no sideways scroll, no control
 * stretched across a desktop screen, and one main landmark plus the site
 * header on every web page.
 *
 * tests/ux/selfcheck.spec.ts proves each check reports a planted violation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export interface Finding {
  /** Which check found it: axe, target, focus, zoom, overflow, stretch. */
  check: string;
  /** The rule inside that check (axe rule id, or the check's own name). */
  rule: string;
  /** A short human description of the element, for the report. */
  where: string;
}

// Playwright runs from app/ (playwright.ux.config.ts), where axe-core is a devDependency.
const AXE_SOURCE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

/** axe-core WCAG 2.2 A/AA violations at serious or critical impact. */
export async function axeFindings(page: Page): Promise<Finding[]> {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const res = await axe.run(document, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    });
    return res.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .flatMap((v) => v.nodes.map((n) => ({ check: "axe", rule: v.id, where: n.target.join(" ").slice(0, 120) })));
  });
}

/**
 * Interactive elements whose box is smaller than `min` px on either side.
 * Skips hidden elements, visually-hidden skip links (1×1 until focused) and
 * links inside running text, which WCAG 2.5.8 exempts.
 */
export async function targetFindings(page: Page, min: number): Promise<Finding[]> {
  return page.evaluate((min) => {
    const sel = "button, a[href], [role=button], [role=switch], [role=tab], input:not([type=hidden]), select, textarea";
    const out: { check: string; rule: string; where: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest("[inert], [aria-hidden=true]")) continue;
      const parent = el.parentElement;
      const inText = cs.display === "inline" && parent !== null && (parent.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 1;
      if (inText) continue;
      if (r.width >= min && r.height >= min) continue;
      const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      out.push({ check: "target", rule: `under-${min}px`, where: `${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()} "${name}"` });
    }
    return out;
  }, min);
}

/**
 * Tabs through the page `steps` times. Reports a control whose focused look
 * matches its resting look (no outline, ring, border, background or
 * underline change on it, its parent or its ::after), and focus leaving an
 * open aria-modal dialog (to another control, or to the page itself).
 *
 * Resting looks are read in place before the walk, so the comparison sees
 * the element exactly where it sits.
 */
export async function focusFindings(page: Page, steps = 20): Promise<Finding[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    // A transparent or zero-width outline (Tailwind's outline-hidden) shows nothing.
    const clear = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
    const outline = (s: CSSStyleDeclaration) =>
      s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0 || clear(s.outlineColor)
        ? "none"
        : `${s.outlineStyle}/${s.outlineWidth}/${s.outlineColor}/${s.outlineOffset}`;
    const look = (s: CSSStyleDeclaration) => [outline(s), s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join("|");
    const full = (el: HTMLElement) =>
      [look(getComputedStyle(el)), look(getComputedStyle(el, "::after")), el.parentElement ? look(getComputedStyle(el.parentElement)) : ""].join("#");
    const resting = new WeakMap<Element, string>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex], [contenteditable=true]"))) {
      resting.set(el, full(el));
    }
    (window as unknown as { __uxFocus: unknown }).__uxFocus = { resting, full, seen: new WeakSet<Element>() };
  });
  const out: Finding[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    // Let a focus transition finish before reading the focused look.
    await page.waitForTimeout(200);
    const step = await page.evaluate(() => {
      const ux = (window as unknown as { __uxFocus: { resting: WeakMap<Element, string>; full: (el: HTMLElement) => string; seen: WeakSet<Element> } }).__uxFocus;
      const active = document.activeElement as HTMLElement | null;
      const onPage = !active || active === document.body || active === document.documentElement;
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[aria-modal=true]")).filter((d) => d.getBoundingClientRect().height > 0);
      const name = onPage
        ? "the page"
        : `${active.tagName.toLowerCase()} "${(active.getAttribute("aria-label") || active.textContent || active.tagName).trim().replace(/\s+/g, " ").slice(0, 40)}"`;
      const escaped = dialogs.length > 0 && (onPage || !dialogs.some((d) => d.contains(active)));
      if (onPage || escaped) return { name, escaped, missing: false };
      const firstTime = !ux.seen.has(active);
      ux.seen.add(active);
      // An element added after the walk started has no resting look; it is not judged.
      const before = ux.resting.get(active);
      const missing = firstTime && before !== undefined && before === ux.full(active);
      return { name, escaped, missing };
    });
    if (step.escaped) {
      out.push({ check: "focus", rule: "escapes-dialog", where: step.name });
      break;
    }
    if (step.missing) out.push({ check: "focus", rule: "no-indicator", where: step.name });
  }
  return out;
}

/** A viewport meta that stops pinch zoom (WCAG 1.4.4): user-scalable off, or a maximum-scale of 1 or less. */
export async function zoomFindings(page: Page): Promise<Finding[]> {
  const content = (await page.locator('meta[name="viewport"]').first().getAttribute("content").catch(() => null)) ?? "";
  const params = new Map(
    content.split(/[,;]/).map((part) => {
      const [k, v = ""] = part.split("=").map((x) => x.trim().toLowerCase());
      return [k, v] as const;
    }),
  );
  const scalable = params.get("user-scalable");
  const max = params.has("maximum-scale") ? parseFloat(params.get("maximum-scale") ?? "") : NaN;
  const blocked = scalable === "no" || scalable === "0" || (!Number.isNaN(max) && max <= 1);
  return blocked ? [{ check: "zoom", rule: "zoom-blocked", where: content }] : [];
}

/** The page scrolls sideways. */
export async function overflowFindings(page: Page): Promise<Finding[]> {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return wide > 1 ? [{ check: "overflow", rule: "horizontal-scroll", where: `${wide}px wider than the viewport` }] : [];
}

/**
 * Buttons stretched wider than `max` px, the phone layout sprawling on a
 * desktop. A sheet's scrim (an empty button out of the tab order that closes
 * the sheet when the dimmed page around it is tapped) covers the screen by
 * design and is not a control anyone sees, so it doesn't count.
 */
export async function stretchFindings(page: Page, max = 720): Promise<Finding[]> {
  return page.evaluate((max) => {
    const isScrim = (el: HTMLElement) => el.tabIndex === -1 && (el.textContent ?? "").trim() === "";
    return Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button]"))
      .filter((el) => el.getBoundingClientRect().width > max && !isScrim(el))
      .map((el) => ({
        check: "stretch",
        rule: `wider-than-${max}px`,
        where: `${Math.round(el.getBoundingClientRect().width)}px ${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`,
      }));
  }, max);
}

/**
 * Website page structure: exactly one main landmark, and the site header (a
 * <nav>) above it, outside it, so every page has a way home and a skip-link target.
 * The header counts when it is in the page, even if a layout hides it on
 * touch screens (the full-screen game on /play and /daily).
 */
export async function landmarkFindings(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { check: string; rule: string; where: string }[] = [];
    const mains = document.querySelectorAll("main, [role=main]");
    if (mains.length === 0) out.push({ check: "landmark", rule: "no-main", where: location.pathname });
    if (mains.length > 1) out.push({ check: "landmark", rule: "many-main", where: `${mains.length} on ${location.pathname}` });
    // Above main: the footer's link lists are navs too, but no site header.
    const first = mains[0];
    const header = Array.from(document.querySelectorAll("nav, [role=navigation]")).some(
      (el) => !el.closest("main, [role=main]") && (!first || el.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    if (!header) out.push({ check: "landmark", rule: "no-site-header", where: location.pathname });
    return out;
  });
}

/** Findings counted by `check/rule`, the unit the baseline allows. */
export function countByRule(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const key = `${f.check}/${f.rule}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * How this surface's counts differ from what the baseline allows. A rule
 * above its allowance is a regression. A rule below it means the page got
 * better and the baseline must be lowered (`pnpm ux:baseline`), so a fixed
 * problem can't quietly come back. A rule missing from the baseline allows zero.
 * An empty result means the counts match the baseline exactly.
 */
export function baselineDiff(counts: Record<string, number>, allowed: Record<string, number> | undefined): string[] {
  const rules = new Set([...Object.keys(counts), ...Object.keys(allowed ?? {})]);
  const out: string[] = [];
  for (const rule of [...rules].sort()) {
    const n = counts[rule] ?? 0;
    const max = allowed?.[rule] ?? 0;
    if (n > max) out.push(`${rule}: ${n} found, ${max} allowed (regression)`);
    else if (n < max) out.push(`${rule}: ${n} found, ${max} allowed (better: run pnpm ux:baseline)`);
  }
  return out;
}
