import type { MetadataRoute } from "next";
import { resolveBaseUrl } from "../src/config/public";
import { listSitemapBlockSlugs } from "../src/db/blocks";
import { buildSitemapEntries } from "../src/seo/sitemapEntries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = resolveBaseUrl();
  let slugs: string[] = [];
  try {
    slugs = await listSitemapBlockSlugs();
  } catch (err) {
    console.error("[sitemap] listSitemapBlockSlugs failed:", err);
  }
  return buildSitemapEntries(origin, slugs);
}
