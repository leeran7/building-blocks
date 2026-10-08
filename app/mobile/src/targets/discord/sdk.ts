/**
 * The one Embedded App SDK instance for this page. Constructing it outside
 * Discord throws (no frame_id / instance_id / platform query params), and
 * without a client id there is nothing to talk to: both give null, and the
 * root shows the "Open in Discord" screen.
 */

import { DiscordSDK } from "@discord/embedded-app-sdk";
import { discordClientId } from "./env";
import { launchedByDiscord } from "./urlMappings";

let instance: DiscordSDK | null | undefined;

/** The SDK, or null when this page is not running inside Discord or the build has no client id. */
export function discordSdk(): DiscordSDK | null {
  if (instance !== undefined) return instance;
  const clientId = discordClientId();
  if (!clientId || typeof window === "undefined" || !launchedByDiscord(window.location.search)) {
    instance = null;
    return instance;
  }
  try {
    instance = new DiscordSDK(clientId);
  } catch {
    instance = null;
  }
  return instance;
}
