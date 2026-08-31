/**
 * Bot UA detection patterns.
 * Used by the view-counting pipeline to filter non-human traffic.
 */

/**
 * List of bot user-agent substrings and patterns.
 * Case-insensitive match against UA string.
 */
export const BOT_UA_PATTERNS: string[] = [
  // Search engine crawlers
  "googlebot",
  "bingbot",
  "slurp", // Yahoo
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "applebot",

  // Headless / automation
  "headlesschrome",
  "headless",
  "phantomjs",
  "selenium",
  "puppeteer",
  "playwright",
  "webdriver",
  "automation",

  // Generic crawlers
  "crawler",
  "spider",
  "scraper",
  "bot/",
  "robot",

  // CLI tools / scripts
  "python-urllib",
  "python-requests",
  "curl/",
  "wget/",
  "libwww-perl",
  "go-http-client",
  "okhttp",
  "java/",
  "apache-httpclient",

  // Monitoring / uptime
  "uptimerobot",
  "pingdom",
  "statuspage",
  "newrelic",
  "datadog",
  "synthetics",

  // Preview / embed
  "prerender",
  "rendertron",
  "slackbot",
  "discordbot",

  // Social unfurl crawlers (explicit — do not rely on generic "spider" / "bot/")
  "tiktok",
  "bytespider",
  "bytedance",
];

/**
 * Determine if a user-agent string belongs to a known bot.
 * Case-insensitive.
 *
 * @param ua - user-agent string (may be undefined/empty)
 * @returns true if the UA is a known bot
 */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.trim() === "") return true; // No UA = treat as bot
  const lower = ua.toLowerCase();
  return BOT_UA_PATTERNS.some((pattern) => lower.includes(pattern));
}
