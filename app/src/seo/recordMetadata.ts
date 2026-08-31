/**
 * Record-page (`/b/[slug]`) Open Graph / Twitter metadata.
 * Unknown slug → NOT_FOUND (page generateMetadata calls notFound()).
 */

import type { Metadata } from "next";
import { getBlockBySlug } from "../db/blocks";
import { parseSeasonSlug } from "../game/categories";
import { sanitizeOgText } from "../og/sanitize";
import { buildRecordCanonicalUrl, buildRecordOgImageUrl } from "../share/urls";

export type RecordMetadataResult =
  | { ok: true; metadata: Metadata }
  | { ok: false; reason: "NOT_FOUND" };

export async function getRecordPageMetadata(
  slug: string,
  origin: string
): Promise<RecordMetadataResult> {
  const parsed = parseSeasonSlug(slug);
  if (!parsed) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const block = await getBlockBySlug(parsed);
  if (!block) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const canonical = buildRecordCanonicalUrl(origin, block.slug);
  const image = buildRecordOgImageUrl(origin, block.slug);
  const displayName = sanitizeOgText(block.display_name, 80) || block.display_name;
  const title = `${block.display_name} — Stack`;
  const description = `Stack record page for ${block.display_name}. Peak rank #${block.peak_rank ?? "?"}, ${block.views_served} views served.`;

  const metadata: Metadata = {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: displayName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };

  return { ok: true, metadata };
}
