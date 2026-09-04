/**
 * BrandProfile (mutable singleton, Epic C) + append-only version history.
 */

import { prisma } from "../client";
import type { SocialBrandProfile } from "@prisma/client";

const SINGLETON_ID = "singleton";

export async function getBrandProfile(): Promise<SocialBrandProfile | null> {
  return prisma.socialBrandProfile.findUnique({ where: { id: SINGLETON_ID } });
}

export interface SaveBrandProfileInput {
  name: string;
  niche?: string | null;
  audience?: string | null;
  tone?: string | null;
  style?: string | null;
  topicsToDiscuss?: string[];
  topicsToAvoid?: string[];
  ctas?: string[];
  terminology?: string[];
  competitors?: string[];
  products?: string[];
  positioning?: string | null;
  updatedByUid: string;
}

/** AC-11/AC-15: every save increments version and appends an immutable snapshot. */
export async function saveBrandProfile(input: SaveBrandProfileInput): Promise<SocialBrandProfile> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.socialBrandProfile.findUnique({ where: { id: SINGLETON_ID } });
    const nextVersion = (existing?.version ?? 0) + 1;

    const saved = await tx.socialBrandProfile.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        name: input.name,
        niche: input.niche,
        audience: input.audience,
        tone: input.tone,
        style: input.style,
        topicsToDiscuss: input.topicsToDiscuss ?? [],
        topicsToAvoid: input.topicsToAvoid ?? [],
        ctas: input.ctas ?? [],
        terminology: input.terminology ?? [],
        competitors: input.competitors ?? [],
        products: input.products ?? [],
        positioning: input.positioning,
        version: nextVersion,
        updatedByUid: input.updatedByUid,
      },
      update: {
        name: input.name,
        niche: input.niche,
        audience: input.audience,
        tone: input.tone,
        style: input.style,
        topicsToDiscuss: input.topicsToDiscuss ?? [],
        topicsToAvoid: input.topicsToAvoid ?? [],
        ctas: input.ctas ?? [],
        terminology: input.terminology ?? [],
        competitors: input.competitors ?? [],
        products: input.products ?? [],
        positioning: input.positioning,
        version: nextVersion,
        updatedByUid: input.updatedByUid,
      },
    });

    await tx.socialBrandProfileSnapshot.create({
      data: {
        version: nextVersion,
        data: JSON.parse(JSON.stringify(saved)),
        createdByUid: input.updatedByUid,
      },
    });

    return saved;
  });
}

export async function getBrandProfileSnapshot(version: number) {
  return prisma.socialBrandProfileSnapshot.findUnique({ where: { version } });
}
