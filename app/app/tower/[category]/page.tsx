/**
 * /tower/[category] — legacy redirect. Stacks now live at /stack/[category].
 * Kept so old shared links (and the pre-rebrand deploy) stay alive.
 */

import { redirect } from "next/navigation";

export default async function LegacyTowerRedirect({
  params,
}: LegacyTowerRedirectProps) {
  const { category } = await params;
  redirect(`/stack/${category}`);
}

interface LegacyTowerRedirectProps {
  params: Promise<{ category: string }>;
}
