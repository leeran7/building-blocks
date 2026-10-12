/**
 * The Telegram build's client (mobile/src/targets/telegram):
 *  - TargetRoot signs in with the launch's initData and only then renders the
 *    app; outside Telegram, on a failed sign-in or after Sign out it shows
 *    its own boot screen with a retry, never the app's Sign In;
 *  - buyStarsPack asks the server for an invoice (naming only the pack), opens
 *    it in Telegram, and reports what the Shop sheet understands;
 *  - the platform adapter saves to CloudStorage and pauses with Telegram;
 *  - external links leave through WebApp.openLink.
 *
 * window.Telegram.WebApp is a stand-in; Firebase, the app tree and the
 * network are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fb = vi.hoisted(() => ({
  signInWithCustomToken: vi.fn(async (_token: string) => {}),
  authListener: null as null | ((user: unknown) => void),
}));
vi.mock("../../mobile/src/lib/firebaseAuth", () => ({
  signInWithCustomToken: (token: string) => fb.signInWithCustomToken(token),
  onAuthChange: async (cb: (user: unknown) => void) => {
    fb.authListener = cb;
    cb({ uid: "telegram:42" });
    return () => {
      fb.authListener = null;
    };
  },
  getFreshToken: async () => null,
}));
vi.mock("../../mobile/src/targets/app/root", async () => {
  const { createElement: h } = await import("react");
  return { TargetRoot: () => h("p", { "data-app": "" }, "the-app") };
});
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

const api = vi.hoisted(() => ({
  apiFetch: vi.fn(async (_path: string, _init?: RequestInit): Promise<Response> => new Response("{}", { status: 404 })),
}));
vi.mock("../../mobile/src/lib/api", () => ({
  apiUrl: (p: string) => p,
  apiFetch: (path: string, init?: RequestInit) => api.apiFetch(path, init),
  SITE_ORIGIN: "https://www.doomstack.lol",
  isNative: false,
}));

import { TargetRoot } from "../../mobile/src/targets/telegram/root";
import { buyStarsPack, CREDIT_POLL_ATTEMPTS, CREDIT_POLL_INTERVAL_MS } from "../../mobile/src/targets/telegram/payments";
import { telegramPlatform } from "../../mobile/src/targets/telegram/platform";
import { externalUrl, routeExternalLinks } from "../../mobile/src/targets/telegram/shell";
import { targetConfig as telegramTarget } from "../../mobile/src/targets/telegram/config";
import type { InvoiceStatus, TelegramWebApp } from "../../mobile/src/targets/telegram/webApp";
import { ShopError } from "../../mobile/src/lib/shop";
import { gemPackById } from "../../src/lib/gemPacks";

const PACK = gemPackById("gems-1200")!;
const INIT_DATA = "query_id=Q&user=%7B%22id%22%3A42%7D&auth_date=1760000000&hash=abc";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A Telegram.WebApp stand-in that records what the app asked of it. */
function fakeWebApp(initData = INIT_DATA) {
  const events = new Map<string, Set<() => void>>();
  const cloud = new Map<string, string>();
  const backClicks = new Set<() => void>();
  const app = {
    initData,
    version: "8.0",
    platform: "ios",
    themeParams: {},
    isVersionAtLeast: (v: string) => Number(v) <= 8,
    ready: vi.fn(),
    expand: vi.fn(),
    disableVerticalSwipes: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBottomBarColor: vi.fn(),
    onEvent: (e: string, cb: () => void) => void (events.get(e) ?? events.set(e, new Set()).get(e)!).add(cb),
    offEvent: (e: string, cb: () => void) => void events.get(e)?.delete(cb),
    openLink: vi.fn(),
    openTelegramLink: vi.fn(),
    invoiceStatus: "paid" as InvoiceStatus,
    openInvoice: vi.fn((_url: string, cb?: (s: InvoiceStatus) => void) => cb?.(app.invoiceStatus)),
    BackButton: {
      visible: false,
      show: vi.fn(() => void (app.BackButton.visible = true)),
      hide: vi.fn(() => void (app.BackButton.visible = false)),
      onClick: (cb: () => void) => void backClicks.add(cb),
      offClick: (cb: () => void) => void backClicks.delete(cb),
    },
    HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
    CloudStorage: {
      getItem: (k: string, cb: (err: string | null, v?: string) => void) => cb(null, cloud.get(k) ?? ""),
      setItem: vi.fn((k: string, v: string) => void cloud.set(k, v)),
    },
    emit: (e: string) => events.get(e)?.forEach((cb) => cb()),
    cloud,
    backClicks,
  };
  window.Telegram = { WebApp: app as unknown as TelegramWebApp };
  return app;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fb.authListener = null;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ customToken: "custom-token" }))
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.Telegram;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function renderRoot() {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(TargetRoot)));
  });
}

const bootState = () => container.querySelector("[data-telegram-boot]")?.getAttribute("data-telegram-boot") ?? null;
const appShown = () => container.querySelector("[data-app]") !== null;
const buttonText = () => container.querySelector("button")?.textContent?.trim();

describe("Telegram TargetRoot", () => {
  it("signs in with the launch's initData, then renders the app inside Telegram's chrome", async () => {
    const app = fakeWebApp();
    await renderRoot();

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/telegram",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ initData: INIT_DATA }) })
    );
    expect(fb.signInWithCustomToken).toHaveBeenCalledWith("custom-token");
    expect(appShown()).toBe(true);
    expect(app.ready).toHaveBeenCalled();
    expect(app.expand).toHaveBeenCalled();
    expect(app.disableVerticalSwipes).toHaveBeenCalled();
    expect(app.setHeaderColor).toHaveBeenCalledWith("#0a0a0c");
    // Play is a tab root: Telegram's Close, not Back.
    expect(app.BackButton.visible).toBe(false);
  });

  it("outside Telegram shows its own screen with a retry, and never calls the API", async () => {
    fakeWebApp("");
    await renderRoot();
    expect(bootState()).toBe("outside");
    expect(buttonText()).toBe("Try again");
    expect(fetch).not.toHaveBeenCalled();
    expect(appShown()).toBe(false);
    expect(container.textContent).not.toMatch(/apple|google/i);
  });

  it("shows the server's reason when sign-in is refused, and retries into the app", async () => {
    fakeWebApp();
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ error: "Couldn't verify your Telegram sign-in. Reopen the game from Telegram.", code: "INVALID_INIT_DATA" }, 401)
    );
    await renderRoot();
    expect(bootState()).toBe("error");
    expect(container.textContent).toMatch(/Reopen the game from Telegram/);
    expect(fb.signInWithCustomToken).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector("button")!.click();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(appShown()).toBe(true);
  });

  it("shows the error screen when the network fails", async () => {
    fakeWebApp();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await renderRoot();
    expect(bootState()).toBe("error");
    expect(appShown()).toBe(false);
  });

  it("goes back to the Telegram boot screen, not the app's Sign In, after Sign out", async () => {
    fakeWebApp();
    await renderRoot();
    expect(appShown()).toBe(true);
    await act(async () => {
      fb.authListener?.(null);
    });
    expect(appShown()).toBe(false);
    expect(bootState()).toBe("signedOut");
    expect(buttonText()).toBe("Sign in with Telegram");
  });

  it("shows Telegram's BackButton on a pushed screen and goes back with it", async () => {
    const app = fakeWebApp();
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ["/", "/settings"], initialIndex: 1 }, createElement(TargetRoot)));
    });
    expect(app.BackButton.visible).toBe(true);
    expect(app.backClicks.size).toBe(1);
    await act(async () => {
      app.backClicks.forEach((cb) => cb());
    });
    // Back on Play (a tab root): the button hides and its handler is gone.
    expect(app.BackButton.visible).toBe(false);
    expect(app.backClicks.size).toBe(0);
  });
});

describe("buyStarsPack", () => {
  let gems = 100;

  beforeEach(() => {
    gems = 100;
    api.apiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/shop") return json({ gems, ownedIds: [] });
      if (path === "/api/gems/telegram/invoice") return json({ invoiceLink: "https://t.me/$inv" });
      return json({}, 404);
    });
  });

  it("is the Telegram target's payments, priced in Stars", () => {
    expect(telegramTarget.payments?.packPrice(PACK)).toBe("775 Stars");
  });

  it("asks for an invoice naming only the pack, opens it, and reports the credited balance", async () => {
    vi.useFakeTimers();
    const app = fakeWebApp();
    app.openInvoice.mockImplementation((_url, cb) => {
      gems = 100 + PACK.gems; // the webhook credits while Telegram closes the sheet
      cb?.("paid");
    });
    const result = buyStarsPack(PACK);
    await vi.advanceTimersByTimeAsync(CREDIT_POLL_INTERVAL_MS);
    expect(await result).toEqual({ kind: "credited", gems: 100 + PACK.gems });

    const invoiceCall = api.apiFetch.mock.calls.find(([p]) => p === "/api/gems/telegram/invoice")!;
    expect(JSON.parse(String(invoiceCall[1]?.body))).toEqual({ packId: PACK.id });
    expect(app.openInvoice).toHaveBeenCalledWith("https://t.me/$inv", expect.any(Function));
  });

  it("returns cancelled when the player closes the invoice", async () => {
    const app = fakeWebApp();
    app.invoiceStatus = "cancelled";
    expect(await buyStarsPack(PACK)).toEqual({ kind: "cancelled" });
  });

  it("throws a ShopError when the payment fails", async () => {
    const app = fakeWebApp();
    app.invoiceStatus = "failed";
    await expect(buyStarsPack(PACK)).rejects.toMatchObject({ name: "ShopError", code: "PAYMENT_FAILED" });
  });

  it("says the gems are on the way when the webhook has not credited by the last poll", async () => {
    vi.useFakeTimers();
    fakeWebApp();
    const result = buyStarsPack(PACK);
    const settled = expect(result).rejects.toMatchObject({ code: "PENDING" });
    await vi.advanceTimersByTimeAsync(CREDIT_POLL_INTERVAL_MS * CREDIT_POLL_ATTEMPTS);
    await settled;
    expect(api.apiFetch.mock.calls.filter(([p]) => p === "/api/shop")).toHaveLength(1 + CREDIT_POLL_ATTEMPTS);
  });

  it("passes on the server's refusal", async () => {
    fakeWebApp();
    api.apiFetch.mockImplementation(async (path: string) =>
      path === "/api/shop"
        ? json({ gems, ownedIds: [] })
        : json({ error: "Open Doomstack from Telegram to pay with Stars", code: "NOT_TELEGRAM_ACCOUNT" }, 403)
    );
    const err = await buyStarsPack(PACK).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShopError);
    expect(err).toMatchObject({ code: "NOT_TELEGRAM_ACCOUNT", message: "Open Doomstack from Telegram to pay with Stars" });
  });

  it("refuses an invoice link that is not Telegram's", async () => {
    const app = fakeWebApp();
    api.apiFetch.mockImplementation(async (path: string) =>
      path === "/api/shop" ? json({ gems, ownedIds: [] }) : json({ invoiceLink: "https://evil.example/pay" })
    );
    await expect(buyStarsPack(PACK)).rejects.toBeInstanceOf(ShopError);
    expect(app.openInvoice).not.toHaveBeenCalled();
  });

  it("outside Telegram refuses without calling the server", async () => {
    fakeWebApp("");
    await expect(buyStarsPack(PACK)).rejects.toMatchObject({ code: "NOT_IN_TELEGRAM" });
    expect(api.apiFetch).not.toHaveBeenCalled();
  });
});

describe("telegramPlatform", () => {
  it("saves to CloudStorage and localStorage, and loads from the cloud first", async () => {
    const app = fakeWebApp();
    await telegramPlatform.saveData("best_height", "1234");
    expect(app.cloud.get("best_height")).toBe("1234");
    expect(localStorage.getItem("best_height")).toBe("1234");
    localStorage.removeItem("best_height");
    expect(await telegramPlatform.loadData("best_height")).toBe("1234");
  });

  it("falls back to localStorage for keys CloudStorage cannot hold, or without Telegram", async () => {
    const app = fakeWebApp();
    await telegramPlatform.saveData("bad key!", "x");
    expect(app.CloudStorage.setItem).not.toHaveBeenCalled();
    expect(await telegramPlatform.loadData("bad key!")).toBe("x");

    delete window.Telegram;
    localStorage.setItem("k", "local");
    expect(await telegramPlatform.loadData("k")).toBe("local");
  });

  it("pauses on Telegram's deactivated and resumes on activated", () => {
    const app = fakeWebApp();
    const seen: boolean[] = [];
    const off = telegramPlatform.onPauseChange((p) => seen.push(p));
    app.emit("deactivated");
    app.emit("activated");
    off();
    app.emit("deactivated");
    expect(seen).toEqual([true, false]);
  });

  it("celebrates with Telegram's haptics", () => {
    const app = fakeWebApp();
    telegramPlatform.happyMoment();
    expect(app.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("success");
  });
});

describe("external links", () => {
  it("treats only http(s) on another origin as external", () => {
    const origin = "https://www.doomstack.lol";
    expect(externalUrl("https://www.doomstack.lol/privacy", origin)).toBeNull();
    expect(externalUrl("/c/ada", origin)).toBeNull();
    expect(externalUrl("javascript:alert(1)", origin)).toBeNull();
    expect(externalUrl("https://example.com/x", origin)?.href).toBe("https://example.com/x");
  });

  it("opens window.open targets through Telegram while routed, and restores window.open after", () => {
    const app = fakeWebApp();
    const original = window.open;
    const undo = routeExternalLinks(app as unknown as TelegramWebApp);
    expect(window.open("https://example.com/terms", "_blank")).toBeNull();
    expect(app.openLink).toHaveBeenCalledWith("https://example.com/terms");
    window.open("https://t.me/doomstack_bot");
    expect(app.openTelegramLink).toHaveBeenCalledWith("https://t.me/doomstack_bot");

    const a = document.createElement("a");
    a.href = "https://example.org/page";
    document.body.appendChild(a);
    a.click();
    expect(app.openLink).toHaveBeenCalledWith("https://example.org/page");
    a.remove();

    undo();
    expect(window.open).toBe(original);
  });
});
