import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { shareInvite } from "@app/lib/shareInvite";
import { apiFetch, API_BASE } from "../lib/api";
import { ScreenHeader, ScreenBody, Card, Button } from "../components/ui";
import { PendingChallengesSection } from "../components/challenge/PendingChallengesSection";
import { FriendRequestsSection } from "../components/challenge/FriendRequestsSection";
import { FriendsListSection } from "../components/challenge/FriendsListSection";
import { UserSearchSection } from "../components/challenge/UserSearchSection";

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

/**
 * Challenge hub: pending challenges, friend requests, friends list (with
 * in-app challenge), add-friend search, and a share-link fallback for
 * challenging anyone outside the app.
 */
export function ChallengeScreen() {
  const navigate = useNavigate();
  const [friendsRefreshKey, setFriendsRefreshKey] = useState(0);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);
  const [shareState, setShareState] = useState<ShareState>({ status: "idle" });

  const handleFriendAccepted = useCallback(() => {
    setFriendsRefreshKey((k) => k + 1);
  }, []);

  const handleRequestSent = useCallback(() => {
    setRequestsRefreshKey((k) => k + 1);
  }, []);

  const handleShareLink = useCallback(async () => {
    setShareState({ status: "loading" });
    try {
      const res = await apiFetch("/api/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: "tech" }),
      });
      // 409 = an open challenge already exists; reuse it rather than
      // orphaning a second row.
      if (res.status === 409) {
        const body = (await res.json()) as { existingId: string };
        await shareInvite(`${API_BASE}/duel/${body.existingId}`).catch(() => {});
        navigate(`/duel/${body.existingId}`);
        return;
      }
      if (res.status === 429) {
        setShareState({ status: "error", message: "Too many challenges — give it a minute" });
        return;
      }
      if (!res.ok) {
        setShareState({ status: "error", message: "Couldn't create link — tap to retry" });
        return;
      }
      const body = (await res.json()) as { id: string };
      await shareInvite(`${API_BASE}/duel/${body.id}`).catch(() => {});
      navigate(`/duel/${body.id}`);
    } catch {
      setShareState({ status: "error", message: "Couldn't create link — tap to retry" });
    }
  }, [navigate]);

  return (
    <main className="flex h-full flex-col">
      <ScreenHeader eyebrow="1v1" title="Challenge" onBack={() => navigate(-1)} />
      <ScreenBody>
        <div className="flex flex-col gap-6 pt-1 pb-4">
          <PendingChallengesSection />

          <FriendRequestsSection
            refreshKey={requestsRefreshKey}
            onAccepted={handleFriendAccepted}
          />

          <FriendsListSection refreshKey={friendsRefreshKey} />

          <UserSearchSection onFriendRequestSent={handleRequestSent} />

          <div className="border-t border-border-subtle pt-5">
            <Card>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                Share a link
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Create a private challenge link to share outside the app.
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  busy={shareState.status === "loading"}
                  onPress={handleShareLink}
                >
                  Create &amp; share link
                </Button>
              </div>
              {shareState.status === "error" && (
                <p className="mt-2 text-center text-xs text-ember">{shareState.message}</p>
              )}
            </Card>
          </div>
        </div>
      </ScreenBody>
    </main>
  );
}
