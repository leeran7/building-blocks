/**
 * The Discord Activity's browser plumbing: the URL mappings as the SDK's own
 * remapper applies them, external links, and pause on visibility / PIP.
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptRemap } from "@discord/embedded-app-sdk";
import {
  CLIENT_URL_MAPPINGS,
  PORTAL_URL_MAPPINGS,
  THIRD_PARTY_URL_MAPPINGS,
  launchedByDiscord,
} from "../../mobile/src/targets/discord/urlMappings";
import { discordWindowOpen, externalUrl } from "../../mobile/src/targets/discord/externalLinks";
import { createDiscordPlatform, LAYOUT_MODE_PIP } from "../../mobile/src/targets/discord/platform";

const remap = (url: string) => attemptRemap({ url: new URL(url), mappings: [...CLIENT_URL_MAPPINGS] }).toString();
const here = () => window.location.host;

describe("URL mappings", () => {
  it.each([
    ["https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=k", "/.proxy/firebase-auth/v1/accounts:signInWithCustomToken?key=k"],
    ["https://securetoken.googleapis.com/v1/token?key=k", "/.proxy/firebase-token/v1/token?key=k"],
    ["wss://main.realtime.ably.net/?access_token=t", "/.proxy/ably-main/?access_token=t"],
    ["https://main.realtime.ably.net/time", "/.proxy/ably-main/time"],
    ["https://main.c.fallback.ably-realtime.com/time", "/.proxy/ably-c/time"],
    ["https://internet-up.ably-realtime.com/is-the-internet-up.txt", "/.proxy/ably-up/is-the-internet-up.txt"],
  ])("sends %s through the Activity's proxy", (from, path) => {
    const out = new URL(remap(from));
    expect(out.host).toBe(here());
    expect(out.pathname + out.search).toBe(path);
  });

  it("leaves the app's own relative API calls alone (apiBase already adds /.proxy)", () => {
    const own = `${window.location.origin}/.proxy/api/shop`;
    expect(remap(own)).toBe(own);
  });

  it("lists every client mapping in the portal set, and no prefix shadows another", () => {
    const portal = new Map(PORTAL_URL_MAPPINGS.map((m) => [m.prefix, m.target]));
    for (const m of THIRD_PARTY_URL_MAPPINGS) expect(portal.get(m.prefix)).toBe(m.target);
    expect(portal.get("/")).toBe("www.doomstack.lol/play/discord");
    expect(portal.get("/api")).toBe("www.doomstack.lol/api");
    const prefixes = PORTAL_URL_MAPPINGS.map((m) => m.prefix).filter((p) => p !== "/");
    for (const a of prefixes) {
      for (const b of prefixes) if (a !== b) expect(b.startsWith(a)).toBe(false);
    }
  });

  it("detects a Discord launch by its frame_id", () => {
    expect(launchedByDiscord("?frame_id=f&instance_id=i&platform=desktop")).toBe(true);
    expect(launchedByDiscord("")).toBe(false);
  });
});

describe("external links", () => {
  it("hands http(s) URLs to Discord and refuses script URLs", async () => {
    const open = vi.fn(async () => ({ opened: true }));
    const winOpen = discordWindowOpen(open, "https://123.discordsays.com/");
    expect(winOpen("https://www.doomstack.lol/privacy", "_blank", "noopener")).toBeNull();
    winOpen("javascript:alert(1)");
    winOpen("data:text/html,hi");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ url: "https://www.doomstack.lol/privacy" });
    expect(externalUrl(undefined, "https://x.test/")).toBeNull();
  });
});

describe("Discord platform pause", () => {
  let visibility: DocumentVisibilityState = "visible";
  afterEach(() => {
    visibility = "visible";
    vi.restoreAllMocks();
  });

  it("pauses while hidden or shrunk to the PIP tile, and resumes when neither", async () => {
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    let layout: ((mode: number) => void) | null = null;
    const unsubscribeLayout = vi.fn();
    const platform = createDiscordPlatform(async () => ({
      onLayoutMode: async (cb) => {
        layout = cb;
        return unsubscribeLayout;
      },
    }));
    const seen: boolean[] = [];
    const stop = platform.onPauseChange((p) => seen.push(p));
    await vi.waitFor(() => expect(layout).not.toBeNull());

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    layout!(LAYOUT_MODE_PIP);
    layout!(0);
    expect(seen).toEqual([true, false, true, false]);

    stop();
    expect(unsubscribeLayout).toHaveBeenCalled();
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen).toHaveLength(4);
  });

  it("still pauses on visibility when Discord has no layout events", async () => {
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const platform = createDiscordPlatform(async () => Promise.reject(new Error("no sdk")));
    const seen: boolean[] = [];
    platform.onPauseChange((p) => seen.push(p));
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen).toEqual([true]);
  });
});
