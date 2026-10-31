/**
 * SoftNavigationFlag marks <html data-soft-nav> on an in-app navigation, so
 * globals.css stops replaying `.climb-reveal` page entrances under the view
 * transition (they faded each switched tab in from blank). A fresh load, and a
 * link to another site, leave the entrance alone.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SoftNavigationFlag } from "../../src/components/SoftNavigationFlag";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function link(href: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  const label = document.createElement("span");
  label.textContent = "go";
  a.appendChild(label);
  // Like Next's <Link>: the navigation never leaves the page.
  a.addEventListener("click", (e) => e.preventDefault());
  document.body.appendChild(a);
  return a;
}

const flagged = () => document.documentElement.hasAttribute("data-soft-nav");

beforeEach(async () => {
  delete document.documentElement.dataset.softNav;
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(SoftNavigationFlag));
  });
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  root = null;
  container = null;
  delete document.documentElement.dataset.softNav;
});

describe("SoftNavigationFlag", () => {
  it("is off on a fresh load", () => {
    expect(flagged()).toBe(false);
  });

  it("turns on when a same-origin link is clicked, from a child of the link", () => {
    link(`${window.location.origin}/daily`).querySelector("span")!.click();
    expect(flagged()).toBe(true);
  });

  it("stays off for a link to another site", () => {
    link("https://example.com/elsewhere").click();
    expect(flagged()).toBe(false);
  });

  it("stays off for a click that is not on a link", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.click();
    expect(flagged()).toBe(false);
  });

  it("turns on for back / forward", () => {
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(flagged()).toBe(true);
  });

  it("stops listening once unmounted", () => {
    act(() => root?.unmount());
    root = null;
    link(`${window.location.origin}/play`).click();
    expect(flagged()).toBe(false);
  });
});
