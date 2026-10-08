/**
 * Feature gating driven by targetConfig.features (mobile/src/targets/*):
 *  - with every feature on (the native app) the signed-in routes and the map's
 *    mode rail are exactly what they were before targets existed;
 *  - with duels off (Telegram) there is no duel room, no Challenge screen and
 *    no Versus button, and a link to one lands on the map.
 *
 * Renders the real App and ModeRail; the screens are stand-ins that print
 * their name, and auth, levels, haptics and the network are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetFeatures } from "../../mobile/src/targets/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const target = vi.hoisted(() => ({
  features: { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true } as TargetFeatures,
}));

vi.mock("@target/config", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../mobile/src/targets/app/config")>();
  return {
    targetConfig: {
      ...real.targetConfig,
      get features() {
        return target.features;
      },
    },
  };
});

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false }),
}));
vi.mock("../../mobile/src/contexts/LevelsContext", () => ({ useLevels: () => ({ season: {}, error: false }) }));
vi.mock("../../mobile/src/contexts/AppDataContext", () => ({
  useHubPrefetch: () => ({ data: null, loading: false, error: false, fetchedAt: 1 }),
  useDailyLeaderboard: () => ({ data: null }),
}));
vi.mock("../../mobile/src/hooks/useMatchmakingQueue", () => ({
  useMatchmakingQueue: () => ({
    state: { status: "idle", duelId: null, errorMessage: null },
    join: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("../../mobile/src/lib/useNativeShell", () => ({ useNativeShell: () => {} }));
vi.mock("../../mobile/src/lib/launchSplash", () => ({ launchReady: () => true, useLaunchSplash: () => true }));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/components/AnimatedBackdrop", () => ({ AnimatedBackdrop: () => null }));
vi.mock("../../mobile/src/components/BottomNav", () => ({ BottomNavDock: () => null, isTabRoot: () => false }));
vi.mock("../../mobile/src/components/RouteTransition", () => ({
  RouteTransition: ({ children }: { children: (l: unknown) => unknown }) => {
    // The real one hands its children the location to render; the router's own is enough here.
    return createElement(LocationChildren, { render: children });
  },
}));

/** One stand-in per screen: prints its name. */
const screen = vi.hoisted(() => (name: string) => async () => {
  const { createElement: h } = await import("react");
  return () => h("p", { "data-screen": name }, name);
});
vi.mock("../../mobile/src/screens/LevelMapScreen", async () => ({ LevelMapScreen: await screen("LevelMap")() }));
vi.mock("../../mobile/src/screens/ClimbScreen", async () => ({ ClimbScreen: await screen("Climb")() }));
vi.mock("../../mobile/src/screens/LevelPlayScreen", async () => ({ LevelPlayScreen: await screen("LevelPlay")() }));
vi.mock("../../mobile/src/screens/DuelRoomScreen", async () => ({ DuelRoomScreen: await screen("DuelRoom")() }));
vi.mock("../../mobile/src/screens/TrainingScreen", async () => ({ TrainingScreen: await screen("Training")() }));
vi.mock("../../mobile/src/screens/LeaderboardScreen", async () => ({ LeaderboardScreen: await screen("Leaderboard")() }));
vi.mock("../../mobile/src/screens/ProfileScreen", async () => ({ ProfileScreen: await screen("Profile")() }));
vi.mock("../../mobile/src/screens/EditProfileScreen", async () => ({ EditProfileScreen: await screen("EditProfile")() }));
vi.mock("../../mobile/src/screens/AvatarPickerScreen", async () => ({ AvatarPickerScreen: await screen("AvatarPicker")() }));
vi.mock("../../mobile/src/screens/ChallengeScreen", async () => ({ ChallengeScreen: await screen("Challenge")() }));
vi.mock("../../mobile/src/screens/ShopScreen", async () => ({ ShopScreen: await screen("Shop")() }));
vi.mock("../../mobile/src/screens/SkinDetailsScreen", async () => ({ SkinDetailsScreen: await screen("SkinDetails")() }));
vi.mock("../../mobile/src/screens/SettingsScreen", async () => ({ SettingsScreen: await screen("Settings")() }));
vi.mock("../../mobile/src/screens/SignInScreen", async () => ({ SignInScreen: await screen("SignIn")() }));

import { useLocation, type Location } from "react-router-dom";
import { App, appRoutes } from "../../mobile/src/App";
import { ModeRail } from "../../mobile/src/components/modes/ModeRail";
import { targetConfig as appTarget } from "../../mobile/src/targets/app/config";
import { targetConfig as telegramTarget } from "../../mobile/src/targets/telegram/config";

function LocationChildren({ render }: { render: (l: Location) => unknown }) {
  return render(useLocation()) as ReturnType<typeof createElement>;
}

/** The routes the app had before build targets, in order, with the screen each renders. */
const NATIVE_ROUTES: [string, string][] = [
  ["/", "LevelMap"],
  ["/climb", "Climb"],
  ["/levels/:level/play", "LevelPlay"],
  ["/duel/:id", "DuelRoom"],
  ["/tutorial", "Training"],
  ["/leaderboard", "Leaderboard"],
  ["/profile", "Profile"],
  ["/profile/edit", "EditProfile"],
  ["/profile/avatar", "AvatarPicker"],
  ["/challenge", "Challenge"],
  ["/shop", "Shop"],
  ["/shop/:characterId", "SkinDetails"],
  ["/settings", "Settings"],
  ["*", "Navigate"],
];

const ALL_ON: TargetFeatures = { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true };

/** [path, screen name] for a route table; the screen name is the stand-in's text (or Navigate). */
function table(features: TargetFeatures): [string, string][] {
  return appRoutes(features, "k").map(({ path, element }) => {
    const type = element.type as { name?: string } | ((...a: unknown[]) => unknown);
    if (typeof type === "function" && type.name === "Navigate") return [path, "Navigate"];
    const rendered = (type as () => { props: { children: string } })();
    return [path, rendered.props.children];
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  target.features = { ...ALL_ON };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAt(path: string, node: ReturnType<typeof createElement>) {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, node));
  });
}

const shown = () => container.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;

describe("the targets' features", () => {
  it("the native app has every feature on, Telegram has duels off", () => {
    expect(appTarget.features).toEqual(ALL_ON);
    expect(telegramTarget.features).toEqual({ ...ALL_ON, duels: false });
  });
});

describe("appRoutes", () => {
  it("with every feature on, is the native app's route table, unchanged", () => {
    expect(table(ALL_ON)).toEqual(NATIVE_ROUTES);
  });

  it("with duels off, drops the duel room and Challenge and keeps everything else in order", () => {
    expect(table({ ...ALL_ON, duels: false })).toEqual(
      NATIVE_ROUTES.filter(([p]) => p !== "/duel/:id" && p !== "/challenge")
    );
  });
});

describe("App routes by target", () => {
  it.each([
    ["/duel/abc", "DuelRoom"],
    ["/challenge", "Challenge"],
    ["/shop", "Shop"],
  ])("with every feature on, %s opens %s", async (path, name) => {
    await renderAt(path, createElement(App));
    expect(shown()).toBe(name);
  });

  it.each(["/duel/abc", "/challenge"])("with duels off, %s lands on the map", async (path) => {
    target.features = { ...ALL_ON, duels: false };
    await renderAt(path, createElement(App));
    expect(shown()).toBe("LevelMap");
  });

  it("with duels off, the other screens still open", async () => {
    target.features = { ...ALL_ON, duels: false };
    await renderAt("/leaderboard", createElement(App));
    expect(shown()).toBe("Leaderboard");
  });
});

describe("the map's mode rail by target", () => {
  const railLabels = () => [...container.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label"));

  it("with every feature on, shows Daily, Versus and Ranks", async () => {
    await renderAt("/", createElement(ModeRail));
    expect(railLabels()).toEqual(["Daily Climb", "Versus", "Ranks"]);
  });

  it("with duels off, has no Versus button", async () => {
    target.features = { ...ALL_ON, duels: false };
    await renderAt("/", createElement(ModeRail));
    expect(railLabels()).toEqual(["Daily Climb", "Ranks"]);
  });
});
