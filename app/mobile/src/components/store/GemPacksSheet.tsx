import { useEffect, useRef, useState } from "react";
import { formatGems } from "@app/lib/avatars";
import { GEM_PACKS, formatUsd, type GemPack } from "@app/lib/gemPacks";
import { useShop } from "../../contexts/ShopContext";
import {
  appStorePrices,
  buyGemPack,
  buyGemPackOnWeb,
  offersWebCheckout,
  packPrice,
  ShopError,
  usesAppStore,
  type PackPurchaseResult,
} from "../../lib/shop";
import { notifyError, notifySuccess, tapLight } from "../../lib/haptics";
import { GemIcon } from "./GemIcon";

/**
 * The gem packs, as a bottom sheet over the Shop. On iOS each is an App Store
 * purchase at the store's local price; elsewhere it opens Stripe Checkout and
 * the gems arrive once payment clears. Where Apple allows a link out (US App
 * Store), iOS also offers each pack at the lower web price through Stripe.
 */
export function GemPacksSheet({ onClose }: { onClose: () => void }) {
  const { shop, apply, refresh } = useShop();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [payOnWeb, setPayOnWeb] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    let live = true;
    void appStorePrices().then((p) => {
      if (live) setPrices(p);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!shop) return;
    let live = true;
    void offersWebCheckout(shop).then((ok) => {
      if (live) setPayOnWeb(ok);
    });
    return () => {
      live = false;
    };
  }, [shop]);

  const buy = async (pack: GemPack, onWeb = false) => {
    if (!shop || busy) return;
    void tapLight();
    setBusy(onWeb ? `${pack.id}:web` : pack.id);
    setMessage(null);
    try {
      const result: PackPurchaseResult = onWeb ? await buyGemPackOnWeb(pack) : await buyGemPack(pack, shop);
      if (result.kind === "credited") {
        apply({ gems: result.gems });
        setMessage({ tone: "ok", text: `${formatGems(pack.gems)} gems added.` });
        void notifySuccess();
      } else if (result.kind === "checkout") {
        setMessage({ tone: "ok", text: "Finish paying in the browser. Your gems appear here once it clears." });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ShopError ? err.message : "Something went wrong. Try again." });
      void notifyError();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-void/70 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="gem-packs-title"
        data-gem-packs
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="glass w-full rounded-t-3xl border border-white/10 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="gem-packs-title" className="font-display text-lg font-black uppercase tracking-tight text-text-primary">
            Get gems
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-2 font-mono text-label font-bold uppercase tracking-label text-text-secondary"
          >
            Close
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2.5">
          {GEM_PACKS.map((pack) => (
            <li
              key={pack.id}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-[rgba(16,15,20,0.9)] px-2 pb-3 pt-4"
            >
              {pack.badge && (
                <span className="absolute -top-2 rounded-full bg-signal px-2 py-0.5 font-mono text-label font-bold uppercase text-void">
                  {pack.badge}
                </span>
              )}
              <GemIcon size={30} />
              <span className="font-display text-xl font-black tabular-nums text-text-primary">{formatGems(pack.gems)}</span>
              <button
                type="button"
                data-gem-pack={pack.id}
                disabled={busy !== null || !shop}
                onClick={() => void buy(pack)}
                className="cta-lime w-full rounded-xl py-2 text-center font-display font-black text-void transition-transform active:scale-95 disabled:opacity-60"
              >
                {busy === pack.id ? "…" : packPrice(pack, prices)}
              </button>
              {payOnWeb && (
                <button
                  type="button"
                  data-gem-pack-web={pack.id}
                  disabled={busy !== null || !shop}
                  onClick={() => void buy(pack, true)}
                  className="w-full rounded-xl border border-signal/40 py-1.5 text-center font-mono text-label font-bold uppercase tracking-label text-signal transition-transform active:scale-95 disabled:opacity-60"
                >
                  {busy === `${pack.id}:web` ? "…" : `${formatUsd(pack.usdCents)} on web`}
                </button>
              )}
            </li>
          ))}
        </ul>
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`mt-3 text-meta leading-5 ${message.tone === "error" ? "text-ember" : "text-signal"}`}
          >
            {message.text}
          </p>
        )}
        {payOnWeb && (
          <p className="mt-3 text-meta leading-5 text-text-secondary">
            Pay on the web to skip the App Store fee. Checkout opens in your browser.
          </p>
        )}
        {(!usesAppStore() || payOnWeb) && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 w-full py-2 font-mono text-label font-bold uppercase tracking-label text-text-secondary"
          >
            Paid already? Refresh balance
          </button>
        )}
      </section>
    </div>
  );
}
