/**
 * Shared SEO primitives — single source of truth for canonical URLs, OG/Twitter
 * defaults, and the base JSON-LD nodes. Every page-level `generateMetadata`/
 * `metadata` should build through `buildMetadata()` rather than hand-rolling
 * title/description/canonical/OG fields per file.
 */
import type { Metadata } from "next";
import { resolveBaseUrl } from "../config/public";

export const SITE_URL = resolveBaseUrl();
export const SITE_NAME = "Doomstack";
export const DEFAULT_TITLE = "Doomstack — Altitude is permanent";
export const DEFAULT_DESCRIPTION =
  "Your altitude is permanent. The ground rises instead. The price of #1 falls with every thousand views — until someone buys it.";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Builds an absolute /api/og URL. Always goes through URLSearchParams so
 * every param is percent-encoded — user-submitted block names and category
 * labels can contain spaces/&/quotes and must never be concatenated raw into
 * the query string (see api/checkout/route.ts's display_name sanitization,
 * which strips control/bidi chars but does not URL-encode).
 */
export function ogImageUrl(params: { name?: string; alt?: string; rank?: string; v?: string } = {}): string {
  const sp = new URLSearchParams();
  if (params.name) sp.set("name", params.name);
  if (params.alt) sp.set("alt", params.alt);
  if (params.rank) sp.set("rank", params.rank);
  if (params.v) sp.set("v", params.v);
  const qs = sp.toString();
  return absoluteUrl(`/api/og${qs ? `?${qs}` : ""}`);
}

export function buildMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  robots,
}: {
  title: string;
  description: string;
  path: string;
  /** Absolute image URL. Defaults to /api/og with no params (its own built-in defaults). */
  image?: string;
  imageAlt?: string;
  robots?: Metadata["robots"];
}): Metadata {
  const url = absoluteUrl(path);
  const ogImage = image ?? ogImageUrl();

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(robots ? { robots } : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: imageAlt ?? title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/** @id-stable JSON-LD nodes for the home page's WebSite/Organization graph. */
export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    url: SITE_URL,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}
