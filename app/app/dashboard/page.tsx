import type { Metadata } from "next";
import { cookies } from "next/headers";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { buildDashboardPayload, type DashboardData } from "../../src/db/dashboard";
import { DashboardBody } from "./DashboardBody";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Dashboard — /dashboard
 *
 * Resolves the same payload GET /api/dashboard returns — via the same
 * buildDashboardPayload builder — at request time, so the page paints the
 * user's real record instead of two pulsing skeleton cards while a client
 * fetch round-trips. Mirrors settings/page.tsx.
 *
 * This is the *first paint* only. DashboardBody still revalidates in the
 * background on every mount, because a back/forward navigation restores this
 * payload from Next's client router cache without re-running this function.
 *
 * No `dynamic = "force-dynamic"` export, matching that precedent: `cookies()`
 * is a dynamic API, so reading it already opts this route out of static
 * rendering (confirmed as `ƒ /dashboard` in the `next build` route table).
 * Unlike /duel — where dropping the `headers()` call would silently bake a
 * region decision into cached HTML — dropping the cookie read here cannot
 * produce a stale-but-plausible render: there would simply be no `initialData`
 * and the client fallback would take over.
 */
export default async function DashboardPage() {
  let initialData: DashboardData | null = null;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("firebaseToken")?.value;
    if (token) {
      const decoded = await verifyIdToken(token);
      // Same builder GET /api/dashboard uses — one producer, one shape.
      initialData = await buildDashboardPayload(decoded.uid, decoded.email ?? "");
    }
  } catch {
    // Expired or invalid token — DashboardBody will client-fetch via useAuth.
  }

  return <DashboardBody initialData={initialData} />;
}
