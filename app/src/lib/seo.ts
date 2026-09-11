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

/** Absolute URL of the square brand logo (used by Organization/VideoGame JSON-LD). */
export const SITE_LOGO = absoluteUrl("/logo-1024.png");

/**
 * Owned, verified brand profiles for the Organization `sameAs` array — the
 * strongest structured signal Google uses to build the brand *entity* and
 * disambiguate "Doomstack" (the game) from the generic strategy-gaming term.
 *
 * Add each profile URL here the moment it exists (X, TikTok, YouTube, Instagram,
 * Discord, Product Hunt, itch.io, Steam). Only real, live, brand-owned URLs —
 * a `sameAs` pointing at a 404 or an unrelated page is a negative signal.
 */
export const SOCIAL_PROFILES: readonly string[] = [];

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
    // Helps Google reconcile the brand across how people actually type it.
    alternateName: ["Doomstack game", "doomstack.lol"],
    url: SITE_URL,
    logo: SITE_LOGO,
    description: DEFAULT_DESCRIPTION,
    // Only emit sameAs once real brand profiles exist — an empty array is a
    // no-op, a wrong URL is a negative signal. See SOCIAL_PROFILES.
    ...(SOCIAL_PROFILES.length > 0 ? { sameAs: [...SOCIAL_PROFILES] } : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    url: SITE_URL,
    name: SITE_NAME,
    // Lets Google show "Doomstack (game)" and match brand-intent queries.
    alternateName: "Doomstack game",
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": absoluteUrl("/#organization") },
    // NOTE: no SearchAction (sitelinks searchbox) yet — the site has no
    // query-param search endpoint, and a target that doesn't resolve a search
    // is misleading structured data. Add potentialAction once /browse (or a
    // dedicated /search) reads `?q=`.
  };
}

/**
 * VideoGame node — the single most important disambiguation signal. "Doomstack"
 * is entrenched strategy-gaming jargon (Total War / Stellaris / Paradox) and a
 * Steam title ("Doomstacker"); this node tells Google our entity is *a free,
 * browser, playable game*, not the term. Emitted on the home graph alongside
 * Organization + WebSite.
 */
export function videoGameJsonLd() {
  return {
    "@type": "VideoGame",
    "@id": absoluteUrl("/#game"),
    name: SITE_NAME,
    alternateName: "Doomstack",
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    image: SITE_LOGO,
    applicationCategory: "GameApplication",
    genre: ["Arcade", "Action", "Competitive"],
    gamePlatform: ["Web browser", "Desktop", "Mobile"],
    operatingSystem: "Web browser",
    playMode: ["SinglePlayer", "MultiPlayer"],
    browserRequirements: "Requires a modern web browser. No download or install.",
    inLanguage: "en",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}
