/**
 * robots.txt config. Allows marketing URLs, `/r/`, and `/api/og`.
 * Must not Disallow `/r/`.
 */

import type { MetadataRoute } from "next";

export const ROBOTS_ALLOW = [
  "/",
  "/play",
  "/climb",
  "/b/",
  "/r/",
  "/api/og",
] as const;

export function getRobotsConfig(origin: string): MetadataRoute.Robots {
  const base = origin.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: [...ROBOTS_ALLOW],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
