/**
 * Legacy per-category play route — redirects to the unified free stack game.
 */

import { permanentRedirect } from "next/navigation";

export default function LegacyPlayPage() {
  permanentRedirect("/play");
}
