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
export const DEFAULT_TITLE = "Doomstack — Climb higher, outlast everyone";
export const DEFAULT_DESCRIPTION =
  "A skill-based endless climb. Race the rising lava to the top of the global leaderboard, compete in ranked chip duels, or enter tournaments for cash prizes.";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute URL for the (static, brand) OG image. */
export function ogImageUrl(): string {
  return absoluteUrl("/api/og");
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
