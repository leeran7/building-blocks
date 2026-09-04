/**
 * Legacy per-category climb leaderboard — redirects to the unified free stack.
 */

import { permanentRedirect } from "next/navigation";

export default function LegacyClimbPage() {
  permanentRedirect("/climb");
}
