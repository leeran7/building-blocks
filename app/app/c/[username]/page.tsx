/**
 * /c/[username] — public creator profile.
 *
 * Ties a creator's paid listings and their climbing record together — the
 * public identity that block cards and the climb leaderboard link to. Surfaces
 * only already-public data (visible blocks + the public climb leaderboard).
 */

import { notFound } from "next/navigation";
import { getCreatorProfileByUsername } from "../../../src/db/creator";
import { normalizeUsername } from "../../../src/lib/username";
import { CreatorProfile } from "../../../src/components/Creator/CreatorProfile";
import { Navbar } from "../../../src/components/Navbar";
import { buildMetadata } from "../../../src/lib/seo";

interface CreatorPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: CreatorPageProps) {
  const { username } = await params;
  const norm = normalizeUsername(username);
  if (!norm.valid || !norm.username) {
    return { title: "Creator not found — Stack", robots: { index: false } };
  }
  const profile = await getCreatorProfileByUsername(norm.username);
  if (!profile) {
    return { title: "Creator not found — Stack", robots: { index: false } };
  }
  const title = `${profile.name} (@${profile.username}) — Stack`;
  const description = `${profile.name}'s listings and climbing record on Stack.`;
  return buildMetadata({ title, description, path: `/c/${profile.username}` });
}

export default async function CreatorPage({ params }: CreatorPageProps) {
  const { username } = await params;
  const norm = normalizeUsername(username);
  if (!norm.valid || !norm.username) {
    notFound();
  }

  const profile = await getCreatorProfileByUsername(norm.username);
  if (!profile) {
    notFound();
  }

  return (
    <main id="main-content" className="min-h-screen bg-void">
      <Navbar contextLabel="Creator" />
      <CreatorProfile profile={profile} />
    </main>
  );
}
