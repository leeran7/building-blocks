/**
 * /b/[slug] — Permanent record page (AC-37 through AC-40).
 *
 * Returns HTTP 200 for buried, hidden, and past-season blocks.
 * Never deleted.
 */

import { notFound } from "next/navigation";
import { getBlockBySlug, getBlockSeasonHistory } from "../../../src/db/blocks";
import { getTotalSpend } from "../../../src/db/payments";
import { getOrCreateActiveSeason } from "../../../src/db/seasons";
import { computeGround, isBuried } from "../../../src/engine/index";
import { RecordStats } from "../../../src/components/RecordPage/RecordStats";
import { SharePost } from "../../../src/components/RecordPage/SharePost";
import { TopupForm } from "../../../src/components/RecordPage/TopupForm";
import { RankAnimation } from "../../../src/components/RecordPage/RankAnimation";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface RecordPageProps {
  params: { slug: string };
  searchParams: { payment?: string };
}

export async function generateMetadata({ params }: RecordPageProps) {
  const block = await getBlockBySlug(params.slug);
  if (!block) {
    return { title: "Block not found — Tower" };
  }
  return {
    title: `${block.display_name} — Tower`,
    description: `Tower record page for ${block.display_name}. Peak rank #${block.peak_rank ?? "?"}, ${block.views_served} views served.`,
  };
}

export default async function RecordPage({
  params,
  searchParams,
}: RecordPageProps) {
  const block = await getBlockBySlug(params.slug);

  // Return 404 only if the slug truly doesn't exist (AC-37: always return 200 for real blocks)
  if (!block) {
    notFound();
  }

  const [activeSeason, totalSpendCents, seasonHistory] = await Promise.all([
    getOrCreateActiveSeason(),
    getTotalSpend(block.id),
    getBlockSeasonHistory(params.slug),
  ]);

  const V = activeSeason.views_k;
  const ground = computeGround(V);
  const buried = isBuried(block.altitude, V);
  const hidden = block.hidden_at !== null;

  const seasonsAppeared = new Set(seasonHistory.map((h) => h.season_id)).size;

  // Current rank (approximate — derived from position in tower read)
  // For record pages, we show peak_rank, not current rank
  const showSharePost = searchParams.payment === "success";

  return (
    // HTTP 200 even for buried/hidden/past-season (AC-37)
    <main className="min-h-screen bg-tower-base">
      <div className="bg-tower-surface/50 border-b border-tower-border px-4 py-3">
        <a href="/" className="text-tower-sky text-sm font-bold tracking-widest uppercase">
          TOWER
        </a>
      </div>

      {/* Share post — shown after successful payment (AC-34) */}
      {showSharePost && (
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <div className="bg-green-900/20 border border-green-700/50 rounded p-3 mb-4 text-green-400 text-sm">
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
      />

      {/* Top-up CTA (if not hidden) */}
      {!hidden && (
        <div className="max-w-2xl mx-auto px-4 pb-4">
          <TopupForm blockId={block.id} buried={buried} />
        </div>
      )}

      {/* Standalone loopable rank-change animation (AC-44) */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <RankAnimation />
      </div>
    </main>
  );
}
