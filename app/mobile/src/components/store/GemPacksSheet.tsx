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
import { notifyError, tapLight } from "../../lib/haptics";
import { GemPile, RewardReveal } from "../RewardReveal";
import { GemIcon } from "./GemIcon";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { SheetPortal } from "../SheetPortal";

const DEFAULT_PACK_ID = "gems-1200";

/**
 * The gem packs, as a bottom sheet over the Shop. On iOS each is an App Store
 * purchase at the store's local price; elsewhere it opens Stripe Checkout and
 * the gems arrive once payment clears. Where Apple allows a link out (US App
 * Store), iOS also offers each pack at the lower web price through Stripe.
 * The player picks a pack, then buys it with one button (or on the web).
 */
export function GemPacksSheet({ onClose }: { onClose: () => void }) {
  const { shop, apply, refresh } = useShop();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [payOnWeb, setPayOnWeb] = useState(false);
  // The one-skin pack is picked to start: it covers any single skin.
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_PACK_ID);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);
  // The payoff when gems land: the pack bought, then the balance counting up.
  const [landed, setLanded] = useState<{ gems: number; from: number; to: number } | null>(null);
  // Back from paying on the web: the balance before "Refresh balance", so a
  // rise plays the same payoff (derived, so a stale refresh shows nothing).
  const [refreshedFrom, setRefreshedFrom] = useState<number | null>(null);
  const webGain = refreshedFrom !== null && shop !== null && shop.gems > refreshedFrom ? shop.gems - refreshedFrom : 0;

  useEffect(() => {
    // Hand focus back to what opened the sheet (it can open over another sheet).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    let live = true;
    void appStorePrices().then((p) => {
      if (live) setPrices(p);
    });
    return () => {
      live = false;
      opener?.focus();
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
        // The reveal plays the success haptic when it bursts.
        setLanded({ gems: pack.gems, from: shop.gems, to: result.gems });
        apply({ gems: result.gems });
        setMessage({ tone: "ok", text: `${formatGems(pack.gems)} gems added.` });
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

  const selected = GEM_PACKS.find((p) => p.id === selectedId) ?? GEM_PACKS[0];
  const storeBuy = usesAppStore();

  // Portalled to the body: screens sit in a stacking context under the tab
  // bar, which would cover the sheet's buy button.
  return (
    <SheetPortal centered={false}
      scrim={
        <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={onClose} />
      }
    >
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gem-packs-title"
        data-gem-packs
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // Close this sheet only, not a sheet it was opened over.
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="relative max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] w-full overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 backdrop-blur-xl"
      >
        {/* The grabber: drag the sheet down from here (or its top) to close it. */}
        <div data-sheet-grabber aria-hidden className="-mx-5 -mt-2 flex h-6 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 id="gem-packs-title" className="font-display text-title font-black uppercase tracking-tight text-text-primary">
            Get gems
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-text-secondary transition-transform active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div role="radiogroup" aria-label="Gem packs" className="grid grid-cols-2 gap-3">
          {GEM_PACKS.map((pack) => {
            const on = pack.id === selected.id;
            return (
              <button
                key={pack.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${formatGems(pack.gems)} gems, ${packPrice(pack, prices)}${pack.badge ? `, ${pack.badge}` : ""}`}
                data-gem-pack={pack.id}
                onClick={() => {
                  if (!on) void tapLight();
                  setSelectedId(pack.id);
                  setMessage(null);
                }}
                className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 px-2.5 pb-3 pt-4 transition-transform active:scale-[0.98] ${
                  on ? "border-signal bg-signal/[0.05]" : "border-white/10 bg-[rgba(16,15,20,0.9)]"
                }`}
              >
                {on && (
                  <span aria-hidden className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-signal text-void">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                )}
                <GemIcon size={34} />
                <span className="font-display text-headline font-black tabular-nums text-text-primary">{formatGems(pack.gems)}</span>
                <span className="h-3.5 font-mono text-[10px] font-bold uppercase leading-none tracking-eyebrow text-text-secondary">
                  {pack.badge ?? ""}
                </span>
                <span className="mt-1 w-full rounded-xl border border-white/10 bg-elevated py-2 text-center font-display text-lead font-black tabular-nums text-text-primary">
                  {packPrice(pack, prices)}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          data-gem-pack-buy={selected.id}
          disabled={busy !== null || !shop}
          onClick={() => void buy(selected)}
          className="cta-lime mt-4 flex min-h-[56px] w-full items-center justify-center rounded-2xl px-4 font-display text-lead font-black text-void transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy === selected.id ? "…" : `Buy ${formatGems(selected.gems)} gems · ${packPrice(selected, prices)}`}
        </button>
        <p className="mt-2 text-center text-meta text-text-secondary">
          {storeBuy ? "App Store purchase" : "Secure checkout opens in your browser."}
        </p>
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`mt-3 text-center text-meta leading-5 ${message.tone === "error" ? "text-ember" : "text-signal"}`}
          >
            {message.text}
          </p>
        )}
        {payOnWeb && (
          <>
            <p className="mt-4 flex items-center gap-3 font-mono text-label font-bold uppercase tracking-eyebrow text-text-secondary">
              <span aria-hidden className="h-px flex-1 bg-white/15" />
              Or pay on the web
              <span aria-hidden className="h-px flex-1 bg-white/15" />
            </p>
            <button
              type="button"
              data-gem-pack-web={selected.id}
              disabled={busy !== null || !shop}
              onClick={() => void buy(selected, true)}
              aria-label={`Pay ${formatUsd(selected.usdCents)} on the web for ${formatGems(selected.gems)} gems`}
              className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl border border-white/25 font-display text-lead font-black text-text-primary transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {busy === `${selected.id}:web` ? (
                "…"
              ) : (
                <>
                  <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary">
                    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                  </svg>
                  {formatUsd(selected.usdCents)} on web
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17 17 7M8 7h9v9" />
                  </svg>
                </>
              )}
            </button>
            <p className="mt-2 text-center text-meta text-text-secondary">Opens your browser. Return here after checkout.</p>
          </>
        )}
        {(!storeBuy || payOnWeb) && (
          <button
            type="button"
            onClick={() => {
              if (shop) setRefreshedFrom(shop.gems);
              void refresh();
            }}
            className="mt-3 w-full py-2 font-mono text-label font-bold tracking-label text-text-secondary underline underline-offset-4"
          >
            Already paid? Refresh balance
          </button>
        )}
      </section>
      {(landed || webGain > 0) && (
        <div onClick={(e) => e.stopPropagation()}>
          <RewardReveal
            subject={<GemPile />}
            eyebrow="Gems added"
            title={`+${formatGems(landed?.gems ?? webGain)} gems`}
            countUp={{ from: landed?.from ?? refreshedFrom ?? 0, to: landed?.to ?? shop?.gems ?? 0, suffix: "gems" }}
            detail="Your new balance."
            onDone={() => {
              setLanded(null);
              setRefreshedFrom(null);
              onClose();
            }}
          />
        </div>
      )}
    </SheetPortal>
  );
}
