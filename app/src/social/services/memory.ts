/**
 * Bounded AI memory (Epic M, AC-48/49). Deliberately queries with an
 * explicit `take: N` cap — never "every row ever created." This is a
 * correctness requirement as much as a performance one (loop/architecture.md
 * §10 performance notes).
 */

import { prisma } from "../../db/client";

const RECENT_ITEMS_CAP = 20;
const RECENT_REJECTIONS_CAP = 10;

export async function getBoundedMemorySummary(): Promise<string> {
  const [recentPublished, recentRejections] = await Promise.all([
    prisma.socialContentItem.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      orderBy: { publishedAt: "desc" },
      take: RECENT_ITEMS_CAP,
      select: { platform: true, title: true, hook: true, prompt: true },
    }),
    prisma.socialContentItem.findMany({
      where: { status: "REJECTED", deletedAt: null },
      orderBy: { rejectedAt: "desc" },
      take: RECENT_REJECTIONS_CAP,
      select: { platform: true, title: true, rejectionReason: true },
    }),
  ]);

  if (recentPublished.length === 0 && recentRejections.length === 0) return "";

  const lines: string[] = ["Recent history (for context, do not repeat verbatim):"];
  if (recentPublished.length > 0) {
    lines.push(
      "Recently published: " +
        recentPublished.map((i) => `[${i.platform}] ${i.title ?? i.hook ?? i.prompt ?? "untitled"}`).join("; ")
    );
  }
  if (recentRejections.length > 0) {
    const withReasons = recentRejections.filter((r) => r.rejectionReason);
    if (withReasons.length > 0) {
      lines.push(
        "Previously rejected (avoid repeating these patterns): " +
          withReasons.map((r) => `[${r.platform}] ${r.title ?? "untitled"} — reason: ${r.rejectionReason}`).join("; ")
      );
    }
  }
  return lines.join("\n");
}
