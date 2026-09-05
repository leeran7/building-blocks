/**
 * User settings — profile display name + saved URLs.
 *
 * Saved URLs let a user pick a previously-used link at submit time instead of
 * retyping; new links used at submit are added here too.
 */

import { prisma } from "./client";
import type { CreatorPlatform } from "@prisma/client";

/** Saved social handles keyed by platform (only platforms the user has set). */
export type SocialHandleMap = Partial<Record<CreatorPlatform, string>>;

export interface UserSettings {
  displayName: string | null;
  username: string | null;
  urls: string[];
  social: SocialHandleMap;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [user, urls, social] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { display_name: true, username: true },
    }),
    prisma.savedUrl.findMany({
      where: { userId },
      orderBy: { created_at: "asc" },
      select: { url: true },
    }),
    prisma.savedSocialHandle.findMany({
      where: { userId },
      select: { platform: true, handle: true },
    }),
  ]);
  return {
    displayName: user?.display_name ?? null,
    username: user?.username ?? null,
    urls: urls.map((u) => u.url),
    social: Object.fromEntries(social.map((s) => [s.platform, s.handle])),
  };
}

/** A user's saved social handles as a platform→handle map. */
export async function getUserSocialHandles(
  userId: string
): Promise<SocialHandleMap> {
  const rows = await prisma.savedSocialHandle.findMany({
    where: { userId },
    select: { platform: true, handle: true },
  });
  return Object.fromEntries(rows.map((r) => [r.platform, r.handle]));
}

/**
 * Upsert one saved social handle (idempotent) — used at checkout so a listed
 * platform's handle prefills next time. Empty handle is a no-op.
 */
export async function saveSocialHandle(
  userId: string,
  platform: CreatorPlatform,
  handle: string
): Promise<void> {
  const clean = handle.trim();
  if (!clean) return;
  await prisma.savedSocialHandle.upsert({
    where: { saved_social_user_platform: { userId, platform } },
    create: { userId, platform, handle: clean },
    update: { handle: clean },
  });
}

/**
 * Replace the user's social handles from a validated map: upsert non-empty
 * entries, delete platforms mapped to empty/undefined. Values must already be
 * normalized by the caller (the settings route).
 */
export async function updateUserSocialHandles(
  userId: string,
  map: SocialHandleMap
): Promise<void> {
  const ops = Object.entries(map).map(([platform, handle]) => {
    const p = platform as CreatorPlatform;
    const clean = (handle ?? "").trim();
    return clean
      ? prisma.savedSocialHandle.upsert({
          where: { saved_social_user_platform: { userId, platform: p } },
          create: { userId, platform: p, handle: clean },
          update: { handle: clean },
        })
      : prisma.savedSocialHandle.deleteMany({ where: { userId, platform: p } });
  });
  if (ops.length) await prisma.$transaction(ops);
}

/** Update display name and/or replace the saved-URL list (add new, drop removed). */
export async function updateUserSettings(
  userId: string,
  input: { displayName?: string | null; urls?: string[] }
): Promise<UserSettings> {
  if (input.displayName !== undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: { display_name: input.displayName?.trim() || null },
    });
  }

  if (input.urls !== undefined) {
    const desired = Array.from(
      new Set(input.urls.map((u) => u.trim()).filter(Boolean))
    );
    const existing = (
      await prisma.savedUrl.findMany({ where: { userId }, select: { url: true } })
    ).map((e) => e.url);
    const toAdd = desired.filter((u) => !existing.includes(u));
    const toRemove = existing.filter((u) => !desired.includes(u));

    // Use upsert (not create) for additions: the `existing` list is read outside
    // this transaction, so a concurrent addSavedUrl (e.g. from checkout) could
    // insert the same (userId, url) in the gap. create would then throw P2002 and
    // abort the whole save; upsert is idempotent and race-safe.
    await prisma.$transaction([
      ...(toRemove.length
        ? [prisma.savedUrl.deleteMany({ where: { userId, url: { in: toRemove } } })]
        : []),
      ...toAdd.map((url) =>
        prisma.savedUrl.upsert({
          where: { saved_url_user_url: { userId, url } },
          create: { userId, url },
          update: {},
        })
      ),
    ]);
  }

  return getUserSettings(userId);
}

/** Add a single URL (idempotent) — used when a new URL is used at submit time. */
export async function addSavedUrl(userId: string, url: string): Promise<void> {
  const clean = url.trim();
  if (!clean) return;
  await prisma.savedUrl.upsert({
    where: { saved_url_user_url: { userId, url: clean } },
    create: { userId, url: clean },
    update: {},
  });
}
