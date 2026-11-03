import { useState } from "react";
import { AD_LIVES_PER_DAY } from "@app/levels/rules";
import { useAds } from "../../contexts/AdsContext";
import { useOptionalLevels } from "../../contexts/LevelsContext";
import { notifySuccess } from "../../lib/haptics";
import { Button } from "../ui";

/**
 * Placement B of the ads plan: "Watch ad · +1 life" on the out-of-lives
 * cards. The ad only earns the right to ask: the server grants the life, and
 * only to a player at zero lives who has ad lives left today.
 */
export interface AdLifeOffer {
  /** Ad lives left today (the server's count). */
  left: number;
  /** Plays the rewarded ad, then claims the life it earned. */
  watch(): Promise<AdLifeOutcome>;
}

/** granted: the life is in. skipped: closed early, no life. failed: no ad, or the claim failed. used: no ad lives left today. */
export type AdLifeOutcome = "granted" | "skipped" | "failed" | "used";

/** The offer, or null when no ad life can be had (no ads, no server grant, none left today). */
export function useAdLifeOffer(): AdLifeOffer | null {
  const { ads } = useAds();
  const levels = useOptionalLevels();
  const claim = levels?.claimAdLife ?? null;
  const left = levels?.season?.adLivesLeft ?? 0;
  if (!ads.enabled || !claim || left <= 0) return null;
  return {
    left,
    watch: async () => {
      const outcome = await ads.rewarded();
      if (outcome === "skipped") return "skipped";
      if (outcome !== "finished") return "failed";
      const res = await claim();
      if (res.ok) return "granted";
      return res.code === "AD_LIVES_USED" ? "used" : res.code === "LIVES_AVAILABLE" ? "granted" : "failed";
    },
  };
}

const OUTCOME_COPY: Record<Exclude<AdLifeOutcome, "granted">, string> = {
  skipped: "Watch the whole ad to earn the life.",
  failed: "No ad is available right now. Try again in a bit.",
  used: "That’s all the ad lives for today.",
};

/** The button and today's count. On a grant the card redraws with the life. */
export function WatchAdForLife({ offer }: { offer: AdLifeOffer }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const watch = async () => {
    setBusy(true);
    setNote(null);
    const outcome = await offer.watch();
    setBusy(false);
    if (outcome === "granted") void notifySuccess();
    else setNote(OUTCOME_COPY[outcome]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button busy={busy} onPress={() => void watch()} className="min-h-[52px] text-cta">
        <PlayBadge /> Watch ad · +1 life
      </Button>
      <p className="text-center text-meta text-text-secondary">
        {offer.left} of {AD_LIVES_PER_DAY} ad lives left today
      </p>
      {note && (
        <p role="alert" className="text-center text-meta text-ember">
          {note}
        </p>
      )}
    </div>
  );
}

/** A small "play video" mark, so the button reads as an ad before it is tapped. */
function PlayBadge() {
  return (
    <span aria-hidden className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-md bg-void">
      <svg width="8" height="10" viewBox="0 0 10 12">
        <path d="M0 0L10 6L0 12Z" className="fill-signal" />
      </svg>
    </span>
  );
}
