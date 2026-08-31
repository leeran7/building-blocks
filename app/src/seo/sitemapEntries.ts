/**
 * Sitemap URL list: home, /play, /climb, /b/{slug}. Zero `/r/` paths.
 */

export interface SitemapUrlEntry {
  url: string;
}

export function buildSitemapEntries(
  origin: string,
  slugs: string[]
): SitemapUrlEntry[] {
  const base = origin.replace(/\/$/, "");
  const entries: SitemapUrlEntry[] = [
    { url: `${base}/` },
    { url: `${base}/play` },
    { url: `${base}/climb` },
  ];
  for (const slug of slugs) {
    entries.push({ url: `${base}/b/${slug}` });
  }
  return entries;
}
