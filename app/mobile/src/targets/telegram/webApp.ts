/**
 * Telegram's Mini App client, `window.Telegram.WebApp`, loaded from
 * telegram.org (Telegram requires its own script; there is no npm package).
 * Only the parts this build uses are typed. Every call site must survive the
 * script being blocked or the page being opened outside Telegram.
 */

export const TELEGRAM_SCRIPT_URL = "https://telegram.org/js/telegram-web-app.js";

/** Give up on the script after this long and show the not-in-Telegram screen. */
const SCRIPT_TIMEOUT_MS = 10_000;

export type InvoiceStatus = "paid" | "cancelled" | "failed" | "pending";

export interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
}

interface CloudStorage {
  getItem(key: string, cb: (err: string | null, value?: string) => void): void;
  setItem(key: string, value: string, cb?: (err: string | null, stored?: boolean) => void): void;
}

interface HapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
}

interface BackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TelegramWebApp {
  /** Signed launch data; "" when the page is not running inside Telegram. */
  initData: string;
  version: string;
  platform: string;
  themeParams: TelegramThemeParams;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, cb?: (status: InvoiceStatus) => void): void;
  BackButton: BackButton;
  HapticFeedback?: HapticFeedback;
  CloudStorage?: CloudStorage;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** The WebApp object if the script has run, else null. */
export function currentWebApp(): TelegramWebApp | null {
  return typeof window === "undefined" ? null : (window.Telegram?.WebApp ?? null);
}

/** True when the page was launched by Telegram with signed init data. */
export function isInTelegram(app: TelegramWebApp | null): app is TelegramWebApp {
  return app !== null && typeof app.initData === "string" && app.initData.length > 0;
}

/** The one script load: settles when it loaded, failed or timed out. */
let scriptLoad: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptLoad) return scriptLoad;
  scriptLoad = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = TELEGRAM_SCRIPT_URL;
    script.async = true;
    const timer = window.setTimeout(resolve, SCRIPT_TIMEOUT_MS);
    const settle = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.addEventListener("load", settle);
    script.addEventListener("error", settle);
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * Load telegram-web-app.js once. Resolves to the WebApp object, or null when
 * the script is blocked, fails, or times out. Never rejects.
 */
export async function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (typeof document === "undefined") return null;
  if (!currentWebApp()) await loadScript();
  return currentWebApp();
}

