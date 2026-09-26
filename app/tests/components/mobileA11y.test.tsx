/**
 * Accessibility wiring on the redesigned mobile screens: what assistive tech
 * reads and what reduced motion switches off. Each test renders the real
 * component and asserts the attribute or call a screen reader, a switch user
 * or the OS motion setting depends on.
 *
 * Contrast, tap-target size, focus visibility and text scaling are layout
 * facts. happy-dom does no layout, so those are measured in Chromium (pixel-
 * sampled contrast, bounding boxes, focused vs blurred screenshots, html
 * font-size 130%), not here.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ME = "me";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduce }));

const lava = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock("@app/components/Game/lava", () => ({ drawLava: lava.draw }));

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: ME }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));

const net = vi.hoisted(() => ({ climbers: [] as unknown[], avatarId: null as string | null }));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string): Promise<Response> => {
  if (path === "/api/climb/leaderboard") return jsonResponse({ climbers: net.climbers });
  if (path === "/api/dashboard") {
    return jsonResponse({
      user: { id: ME, email: "me@example.test", username: null },
      freeClimb: { peakY: 5000, rank: 4, totalClimbers: 9, wins: 1, handle: "Me" },
    });
  }
  if (path === "/api/settings") {
    return jsonResponse({ displayName: null, username: null, social: {}, leaderboardConsent: true, avatarId: net.avatarId });
  }
  return jsonResponse({}, 404);
});
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: (path: string) => apiFetch(path),
  API_BASE: "https://example.test",
}));

import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";
import { BottomNav } from "../../mobile/src/components/BottomNav";
import { AnimatedBackdrop } from "../../mobile/src/components/AnimatedBackdrop";
import { UserSearchSection } from "../../mobile/src/components/challenge/UserSearchSection";
import { HomeScreen } from "../../mobile/src/screens/HomeScreen";
import { LeaderboardScreen } from "../../mobile/src/screens/LeaderboardScreen";
import { ProfileScreen } from "../../mobile/src/screens/ProfileScreen";
import { HubHeader } from "../../mobile/src/components/HubHeader";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  motion.reduce = false;
  net.climbers = [];
  net.avatarId = null;
  apiFetch.mockClear();
  lava.draw.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(path: string, element: ReactElement, extra?: ReactElement) {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          AppDataProvider,
          null,
          createElement(
            Routes,
            null,
            createElement(Route, { path: "*", element }),
          ),
          extra,
        ),
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

/** Types into a React-controlled input the way a user does: native setter, then an input event. */
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const climber = (rank: number, userId: string) => ({
  rank,
  userId,
  handle: `Climber ${rank}`,
  username: null,
  peakY: 10_000 - rank * 1000,
  wins: 0,
  avatarId: null,
});

describe("BottomNav", () => {
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Main navigation"] button')];
  const current = () => tabs().filter((t) => t.getAttribute("aria-current") === "page").map((t) => t.textContent);

  it("is a labelled nav landmark whose tabs are named by their visible label", async () => {
    await render("/leaderboard", createElement(BottomNav));
    expect(tabs().map((t) => t.getAttribute("aria-label"))).toEqual(["Home", "Ranks", "Profile"]);
    expect(tabs().map((t) => t.textContent)).toEqual(["Home", "Ranks", "Profile"]);
  });

  it("marks exactly the current route's tab with aria-current=page, and moves it on navigation", async () => {
    await render("/leaderboard", createElement(BottomNav));
    expect(current()).toEqual(["Ranks"]);
    await click(tabs().find((t) => t.textContent === "Profile"));
    expect(current()).toEqual(["Profile"]);
  });

  it("marks no tab on a route that is not a tab (a pushed screen)", async () => {
    await render("/profile/edit", createElement(BottomNav));
    expect(current()).toEqual([]);
  });
});

describe("Profile avatar button", () => {
  const avatarButton = () =>
    [...container.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.endsWith("Change avatar"));

  it("names the current avatar, which the icon-only badge otherwise conveys only visually", async () => {
    net.avatarId = "wolf";
    await render("/profile", createElement(ProfileScreen));
    expect(avatarButton()?.getAttribute("aria-label")).toBe("Avatar: Wolf. Change avatar");
  });

  it("says Initials when no avatar is chosen", async () => {
    await render("/profile", createElement(ProfileScreen));
    expect(avatarButton()?.getAttribute("aria-label")).toBe("Avatar: Initials. Change avatar");
  });
});

describe("Add friends search", () => {
  const input = () => container.querySelector<HTMLInputElement>("input");

  it("gives the field an accessible name, not just a placeholder that disappears on input", async () => {
    await render("/challenge", createElement(UserSearchSection));
    expect(input()?.getAttribute("aria-label")).toBe("Search by email or username");
  });

  it("offers a named Clear search button once there is text, with the glyph hidden, and it clears the field", async () => {
    await render("/challenge", createElement(UserSearchSection));
    const clearButton = () => container.querySelector('button[aria-label="Clear search"]');
    expect(clearButton()).toBeNull();

    await type(input()!, "someone");
    expect(clearButton()).toBeTruthy();
    expect(clearButton()?.querySelector("[aria-hidden]")?.textContent).toBe("✕");

    await click(clearButton());
    expect(input()?.value).toBe("");
    expect(clearButton()).toBeNull();
  });
});

describe("Home daily climb card", () => {
  it("describes the button with its reset line, which its aria-label would otherwise hide", async () => {
    await render("/", createElement(HomeScreen));
    const daily = container.querySelector('button[aria-label="Play the daily climb"]');
    const describedBy = daily?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy!);
    expect(daily?.contains(description)).toBe(true);
    expect(description?.textContent).toMatch(/^Resets in /);
  });
});

describe("Ranks 'Show my row' under reduced motion", () => {
  async function showMyRow() {
    net.climbers = [climber(1, "a"), climber(2, "b"), climber(3, "c"), climber(4, ME), climber(5, "e")];
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await render("/leaderboard", createElement(LeaderboardScreen));
    const banner = [...container.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label")?.endsWith("Show my row"),
    );
    expect(banner).toBeTruthy();
    await click(banner);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(container.querySelector("#lb-me"));
    return scroll.mock.calls[0][0] as ScrollIntoViewOptions;
  }

  it("jumps straight to the row when the user asked for reduced motion", async () => {
    motion.reduce = true;
    expect(await showMyRow()).toEqual({ behavior: "auto", block: "center" });
  });

  it("scrolls smoothly otherwise", async () => {
    expect(await showMyRow()).toEqual({ behavior: "smooth", block: "center" });
  });
});

describe("Ranks podium with a 60-character display name", () => {
  // MAX_NAME in the settings route. The podium clamps at three lines, so the
  // full name must still be available to anyone who sees the ellipsis.
  const LONG = "Maximilian Alexander Montgomery Fitzgerald the Third of York";

  it("keeps the whole name in the text and in the title of each podium name", async () => {
    expect(LONG).toHaveLength(60);
    net.climbers = [{ ...climber(1, "a"), handle: LONG }, climber(2, "b"), climber(3, "c")];
    await render("/leaderboard", createElement(LeaderboardScreen));
    const podium = container.querySelector('[aria-label="Top three climbers"]');
    // Each pedestal's first line is the climber's name.
    const names = [...(podium?.querySelectorAll("li") ?? [])].map((li) => li.querySelector("p"));
    expect(names.map((n) => n?.textContent)).toEqual([climber(2, "b").handle, LONG, climber(3, "c").handle]);
    expect(names.map((n) => n?.getAttribute("title"))).toEqual(names.map((n) => n?.textContent));
  });
});

describe("Backdrop lava under reduced motion", () => {
  function stubCanvas() {
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    return vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  }

  it("paints one still frame and starts no animation loop", async () => {
    motion.reduce = true;
    const raf = stubCanvas();
    await render("/", createElement(AnimatedBackdrop));
    expect(raf).not.toHaveBeenCalled();
    expect(lava.draw).toHaveBeenCalled();
    for (const [, opts] of lava.draw.mock.calls) expect(opts).toMatchObject({ tick: 0, reducedMotion: true });
  });

  it("runs the animation loop when motion is allowed", async () => {
    const raf = stubCanvas();
    await render("/", createElement(AnimatedBackdrop));
    expect(raf).toHaveBeenCalled();
  });
});

describe("Hub header shared by Ranks and Profile", () => {
  async function headerOf(path: string, screen: ReactElement) {
    await render(path, screen);
    const headers = container.querySelectorAll("main > * header, main header");
    const header = headers[0] as HTMLElement | undefined;
    expect(header).toBeTruthy();
    const h1s = container.querySelectorAll("h1");
    const [eyebrow, titleRow, ...rest] = [...header!.children] as HTMLElement[];
    const status = rest.find((el) => el.hasAttribute("data-hub-status"));
    const subtitle = rest.find((el) => !el.hasAttribute("data-hub-status"));
    return {
      h1s: [...h1s].map((h) => h.textContent),
      titleInHeader: header!.contains(h1s[0] ?? null),
      header: header!.className,
      eyebrow: eyebrow.outerHTML,
      h1Class: titleRow.querySelector("h1")?.className,
      subtitleClass: subtitle?.className,
      subtitle: subtitle ? [...subtitle.children].map((c) => (c.getAttribute("aria-hidden") ? "·" : c.textContent)) : [],
      status: status ? { className: status.className, label: status.querySelector(".sr-only")?.textContent } : null,
      childCount: header!.children.length,
    };
  }

  it("gives each screen exactly one h1, the page title, inside the header", async () => {
    net.climbers = [climber(1, "a")];
    const ranks = await headerOf("/leaderboard", createElement(LeaderboardScreen));
    expect(ranks.h1s).toEqual(["Leaderboard"]);
    expect(ranks.titleInHeader).toBe(true);
    act(() => root.unmount());
    root = createRoot(container);
    const profile = await headerOf("/profile", createElement(ProfileScreen));
    expect(profile.h1s).toEqual(["Profile"]);
    expect(profile.titleInHeader).toBe(true);
  });

  it("renders the same eyebrow and title on both; Ranks has a status pill, Profile keeps its subtitle", async () => {
    net.climbers = [climber(1, "a")];
    const ranks = await headerOf("/leaderboard", createElement(LeaderboardScreen));
    act(() => root.unmount());
    root = createRoot(container);
    const profile = await headerOf("/profile", createElement(ProfileScreen));

    expect(profile.header).toBe(ranks.header);
    expect(profile.eyebrow).toBe(ranks.eyebrow);
    expect(profile.h1Class).toBe(ranks.h1Class);
    expect(ranks.eyebrow).toContain(">Doomstack<");
    expect(ranks.eyebrow.match(/aria-hidden="true"/g)).toHaveLength(2);
    // Ranks: no tracked-mono subtitle any more, one status pill instead (dashboard total 9).
    expect(ranks.subtitle).toEqual([]);
    expect(ranks.status?.label).toBe("9 climbers on the all-time board");
    expect(ranks.childCount).toBe(3);
    // Profile: the same tracked-mono subtitle as before, and no pill.
    expect(profile.subtitle).toEqual(["Your climb"]);
    expect(profile.subtitleClass).toBe(
      "mt-2 flex items-center gap-2 font-mono text-label uppercase tracking-label text-text-muted",
    );
    expect(profile.status).toBeNull();
    expect(profile.childCount).toBe(3);
  });

  it("renders subtitle and status independently: the pill only when passed", () => {
    act(() => root.render(createElement(HubHeader, { title: "Profile", subtitle: ["Your climb"] })));
    expect(container.querySelector("[data-hub-status]")).toBeNull();
    expect(container.querySelector("header > p")?.textContent).toBe("Your climb");

    act(() =>
      root.render(
        createElement(HubHeader, {
          title: "Leaderboard",
          subtitle: ["Your climb"],
          status: { icon: createElement("svg"), text: "Resets in 6h 36m", label: "Today's board resets in 6 hours 36 minutes" },
        }),
      ),
    );
    const pill = container.querySelector("header > [data-hub-status]")!;
    expect(container.querySelector("header > p:not([data-hub-status])")?.textContent).toBe("Your climb");
    expect([...pill.children].map((c) => [c.getAttribute("aria-hidden"), c.textContent])).toEqual([
      ["true", ""],
      ["true", "Resets in 6h 36m"],
      [null, "Today's board resets in 6 hours 36 minutes"],
    ]);
  });

  it("renders repeated subtitle segments with distinct keys", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      act(() => root.render(createElement(HubHeader, { title: "Leaderboard", subtitle: ["All time", "All time"] })));
      const subtitle = container.querySelector("header > p");
      const parts = [...(subtitle?.children ?? [])].map((c) => (c.getAttribute("aria-hidden") ? "·" : c.textContent));
      expect(parts).toEqual(["All time", "·", "All time"]);
      const keyWarnings = error.mock.calls.filter((args) => args.some((a) => String(a).includes("same key")));
      expect(keyWarnings).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });
});
