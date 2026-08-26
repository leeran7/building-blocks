/**
 * /tower/[category] — legacy redirect. Stacks now live at /stack/[category].
 * Kept so old shared links (and the pre-rebrand deploy) stay alive.
 */

import { redirect } from "next/navigation";

export default function LegacyTowerRedirect({
  params,
}: {
  params: { category: string };
}) {
  redirect(`/stack/${params.category}`);
}
