/**
 * Legacy per-category play route — redirects to the unified free stack game.
 */

import { redirect } from "next/navigation";

export default function LegacyPlayPage() {
  redirect("/play");
}
