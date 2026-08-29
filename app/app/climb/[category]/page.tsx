/**
 * Legacy per-category climb leaderboard — redirects to the unified free stack.
 */

import { redirect } from "next/navigation";

export default function LegacyClimbPage() {
  redirect("/climb");
}
