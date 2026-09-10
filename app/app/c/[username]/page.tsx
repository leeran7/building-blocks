/**
 * /c/[username] — public creator profile.
 *
 * The public identity the climb leaderboard links to: a creator's saved social
 * handles and their public climbing record. Surfaces only already-public data.
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
    return { title: "Creator not found — Doomstack", robots: { index: false } };
  }
  const profile = await getCreatorProfileByUsername(norm.username);
  if (!profile) {
    return { title: "Creator not found — Doomstack", robots: { index: false } };
  }
  const title = `${profile.name} (@${profile.username}) — Doomstack`;
  const description = `${profile.name}'s climbing record on Doomstack.`;
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
    <main id="main-content" className="grain topo min-h-screen bg-void">
      <Navbar contextLabel="Creator" />
      <CreatorProfile profile={profile} />
    </main>
  );
}
