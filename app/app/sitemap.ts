import type { MetadataRoute } from "next";
import { SITE_URL } from "../src/lib/seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The free climb is one global leaderboard; per-category /climb/[slug] URLs
  // permanent-redirect to /climb, and the paid /stack and /b routes were removed
  // with the paid-stacks deprecation — so neither is listed here.
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/climb`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/play`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/duel`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/rules`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/auth/signin`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/auth/signup`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
