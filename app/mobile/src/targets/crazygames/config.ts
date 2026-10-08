import { noopPlatform } from "../noop";
import type { TargetConfig } from "../types";
import { loadScript } from "../../portal/sdkGuard";
import { CRAZYGAMES_SDK_URL, SCRIPT_TIMEOUT_MS, createCrazyGamesRuntime, type CrazySdk } from "./sdk";

interface CrazyWindow {
  CrazyGames?: { SDK?: CrazySdk };
}

/*
  Created at module load, which is when the session starts: the midgame grace
  period (no ads in the first 3 minutes) counts from here.
*/
const runtime = createCrazyGamesRuntime({
  getSdk: () => (window as unknown as CrazyWindow).CrazyGames?.SDK,
  loadSdkScript: () => loadScript(document, CRAZYGAMES_SDK_URL, SCRIPT_TIMEOUT_MS),
  now: () => Date.now(),
  onPauseChange: noopPlatform.onPauseChange,
});

/** CrazyGames: endless Free Climb only, the CrazyGames SDK v3, midgame ads. */
export const targetConfig: TargetConfig = {
  id: "crazygames",
  name: "Doomstack",
  features: { signIn: false, shop: false, duels: false, leaderboard: false, daily: false, levels: false },
  apiBase: null,
  platform: runtime.platform,
  ads: runtime.ads,
  payments: null,
};
