/**
 * URL validation and sanitisation (NFR-S4).
 * Rejects non-HTTP/HTTPS URLs, strips dangerous protocols.
 */

const ALLOWED_PROTOCOLS = ["http:", "https:"];

export interface UrlValidationResult {
  valid: boolean;
  sanitised?: string;
  error?: string;
}

/**
 * Validate and sanitise a URL submitted by a buyer.
 * Rejects: non-HTTP/HTTPS, data:, javascript:, file:, localhost in production.
 * Returns the sanitised URL (lowercased protocol, no double slashes, etc.)
 */
export function validateUrl(raw: string): UrlValidationResult {
  if (!raw || typeof raw !== "string") {
    return { valid: false, error: "URL is required" };
  }

  const trimmed = raw.trim();

  if (trimmed.length > 2048) {
    return { valid: false, error: "URL too long (max 2048 chars)" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `URL protocol '${parsed.protocol}' is not allowed. Use http:// or https://`,
    };
  }

  // Block private/local/metadata endpoints in all environments (SSRF prevention)
  const host = parsed.hostname.toLowerCase();

  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    // IPv4 loopback
    host === "127.0.0.1" ||
    host.startsWith("127.") ||
    // Link-local (AWS metadata, etc.)
    host.startsWith("169.254.") ||
    // RFC1918 private ranges
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6 loopback / link-local / ULA
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("fe80:") ||
    host.startsWith("[fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    // mDNS / internal hostnames
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost");

  if (isPrivate) {
    return { valid: false, error: "Private/local URLs are not allowed" };
  }

  return { valid: true, sanitised: parsed.toString() };
}
