/**
 * Inside Discord a page may not open windows itself: links must go through
 * the SDK's openExternalLink, which shows Discord's own "leaving Discord"
 * prompt. The shared app opens links with window.open (lib/external.ts), so
 * the Activity replaces window.open with a function that hands http(s) URLs
 * to Discord and refuses everything else.
 */

import type { DiscordSDK } from "@discord/embedded-app-sdk";

export type OpenLink = Pick<DiscordSDK["commands"], "openExternalLink">["openExternalLink"];

/** The http(s) URL to hand Discord, or null for anything else (javascript:, data:, relative junk). */
export function externalUrl(target: string | URL | undefined, base: string): string | null {
  if (target === undefined) return null;
  let url: URL;
  try {
    url = new URL(String(target), base);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
}

/** A window.open replacement that routes links to Discord. Always returns null (no window handle). */
export function discordWindowOpen(openExternalLink: OpenLink, base: string): typeof window.open {
  return (target?: string | URL) => {
    const url = externalUrl(target, base);
    if (url) void openExternalLink({ url }).catch(() => undefined);
    return null;
  };
}

/** Install the replacement on this window. */
export function routeExternalLinks(sdk: Pick<DiscordSDK, "commands">): void {
  window.open = discordWindowOpen((args) => sdk.commands.openExternalLink(args), window.location.href);
}
