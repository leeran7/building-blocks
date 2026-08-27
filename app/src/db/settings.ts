/**
 * User settings — profile display name + saved URLs.
 *
 * Saved URLs let a user pick a previously-used link at submit time instead of
 * retyping; new links used at submit are added here too.
 */

import { prisma } from "./client";

export interface UserSettings {
  displayName: string | null;
  urls: string[];
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [user, urls] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { display_name: true },
    }),
    prisma.savedUrl.findMany({
      where: { userId },
      orderBy: { created_at: "asc" },
      select: { url: true },
    }),
  ]);
  return { displayName: user?.display_name ?? null, urls: urls.map((u) => u.url) };
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
