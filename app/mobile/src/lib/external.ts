import { Browser } from "@capacitor/browser";
import { isNative } from "./api";

/**
 * Open a URL outside the app shell — the native in-app browser on device (so
 * the game shell isn't navigated away), a new tab on web. Best-effort.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    if (isNative) await Browser.open({ url });
    else window.open(url, "_blank", "noopener");
  } catch {
    /* ignore */
  }
}
