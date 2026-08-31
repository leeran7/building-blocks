/**
 * /b/[slug] — Permanent record page (AC-37 through AC-40). V2 dark theme.
 *
 * Returns HTTP 200 for buried, hidden, and past-season blocks.
 * Never deleted.
 *
 * Design spec: design.md §6.20, §7.8
 * Logic unchanged — only visual styling updated.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveBaseUrl } from "../../../src/config/public";
import { getBlockBySlug, getBlockSeasonHistory } from "../../../src/db/blocks";
import { getTotalSpend } from "../../../src/db/payments";
import { getActiveSeason } from "../../../src/db/seasons";
import { isBuried } from "../../../src/engine/index";
import { RecordStats } from "../../../src/components/RecordPage/RecordStats";
import { SharePost } from "../../../src/components/RecordPage/SharePost";
import { TopupForm } from "../../../src/components/RecordPage/TopupForm";
import { RankAnimation } from "../../../src/components/RecordPage/RankAnimation";
import { getCategory, categoryTheme, type Category } from "../../../src/lib/categories";
import { isGameCategory, parseSeasonSlug, resolveGameCategory } from "../../../src/game/categories";
import { Navbar } from "../../../src/components/Navbar";
import { getRecordPageMetadata } from "../../../src/seo/recordMetadata";
import { buildWebPageJsonLd, jsonLdScriptHtml } from "../../../src/share/jsonLd";
import { buildRecordCanonicalUrl } from "../../../src/share/urls";

const BASE_URL = resolveBaseUrl();

export async function generateMetadata({
  params,
}: RecordPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getRecordPageMetadata(slug, resolveBaseUrl());
  if (!result.ok) notFound();
  return result.metadata;
}

export default async function RecordPage({
  params,
  searchParams,
}: RecordPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const parsedSlug = parseSeasonSlug(slug);
  if (!parsedSlug) {
    notFound();
  }
  const block = await getBlockBySlug(parsedSlug);

  // Return 404 only if the slug truly doesn't exist (AC-37: always return 200 for real blocks)
  if (!block) {
    notFound();
  }

  const seasonSlug = parseSeasonSlug(block.category);
  const [activeSeason, totalSpendCents, seasonHistory] = await Promise.all([
    // Read-only: an unauthenticated page view must never mint a season row.
    // V already falls back to 0 below when there is no active season.
    seasonSlug ? getActiveSeason(seasonSlug) : Promise.resolve(null),
    getTotalSpend(block.id),
    getBlockSeasonHistory(block.slug),
  ]);

  const V = activeSeason?.views_k ?? 0;
  const buried = isBuried(block.altitude, V);
  const hidden = block.hidden_at !== null;

  const seasonsAppeared = new Set(seasonHistory.map((h) => h.season_id)).size;

  const showSharePost = sp.payment === "success";
  const cat = recordTheme(block.category);
  const jsonLd = buildWebPageJsonLd({
    url: buildRecordCanonicalUrl(resolveBaseUrl(), block.slug),
    name: `${block.display_name} — Stack`,
    description: `Stack record page for ${block.display_name}. Peak rank #${block.peak_rank ?? "?"}, ${block.views_served} views served.`,
  });

  return (
    // HTTP 200 even for buried/hidden/past-season (AC-37)
    <main className="min-h-screen bg-void" style={categoryTheme(cat)}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptHtml(jsonLd) }}
      />
      {/* Nav — auth-aware */}
      <Navbar contextLabel={`${cat.label} stack`} contextDot={cat.hex} />

      {/* Share post — shown after successful payment (AC-34) */}
      {showSharePost && (
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 mb-4 text-success text-sm">
            Payment successful! Your altitude has been updated.
          </div>
          <SharePost
            display_name={block.display_name}
            slug={block.slug}
            rank={block.peak_rank}
            baseUrl={BASE_URL}
          />
        </div>
      )}

      {/* V2 record stats — dark theme */}
      <RecordStats
        display_name={block.display_name}
        url={block.url}
        slug={block.slug}
        altitude={block.altitude}
        peak_rank={block.peak_rank}
        views_served={block.views_served}
        clicks={block.clicks}
        total_spend_cents={totalSpendCents}
        seasons_appeared={Math.max(1, seasonsAppeared)}
        buried={buried}
        hidden={hidden}
        categoryLabel={cat.label}
      />

      {/* Top-up CTA (if not hidden) */}
      {!hidden && <TopupForm blockId={block.id} buried={buried} />}

      {/* Standalone loopable rank-change animation (AC-44) */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <RankAnimation />
      </div>
    </main>
  );
}

function recordTheme(slug: string | null | undefined): Category {
  const base = getCategory(slug);
  if (slug && isGameCategory(slug)) {
    return { ...base, label: resolveGameCategory(slug).label };
  }
  return base;
}

interface RecordPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment?: string }>;
}
