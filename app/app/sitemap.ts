import type { MetadataRoute } from "next";
import { getVisibleBlockSlugs } from "../src/db/blocks";
import { GAME_CATEGORIES } from "../src/game/categories";
import { SITE_URL } from "../src/lib/seo";

// New blocks are minted continuously (every paid top-up on a new slug, every
// season). Without this, Next serves the sitemap fully static from build
// time and new /b/[slug] pages never get listed until the next deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/climb`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/play`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/rules`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/auth/signin`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/auth/signup`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const categoryEntries: MetadataRoute.Sitemap = GAME_CATEGORIES.map((category) => ({
    url: `${SITE_URL}/stack/${category.slug}`,
    changeFrequency: "hourly",
    priority: 0.7,
  }));

  const blocks = await getVisibleBlockSlugs();
  // No lastModified: the Block model has no updated_at column, and altitude /
  // views_served / peak_rank all change continuously after created_at — a
  // fabricated lastmod would be stale from the moment of creation.
  const blockEntries: MetadataRoute.Sitemap = blocks.map((block) => ({
    url: `${SITE_URL}/b/${block.slug}`,
    changeFrequency: "daily",
    priority: 0.4,
  }));

  return [...staticEntries, ...categoryEntries, ...blockEntries];
}
