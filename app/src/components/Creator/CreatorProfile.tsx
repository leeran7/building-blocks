/**
 * CreatorProfile — the public /c/[username] body.
 *
 * A creator hub: an instrument-style identity band (name, @username, a row of
 * social chips linking out) and their public climbing record. Read-only; all
 * data is already public. ASCENT tokens.
 */

import Link from "next/link";
import { formatAltitudeLabel } from "../../lib/units";
import { SocialMark } from "../Social/SocialMark";
import {
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  handleDisplay,
  profileUrl,
} from "../../lib/socialHandle";
import type { CreatorProfile as CreatorProfileData } from "../../db/creator";

export function CreatorProfile({ profile }: { profile: CreatorProfileData }) {
  const { name, username, social, freeClimb, replays } = profile;
  const linked = SOCIAL_PLATFORMS.filter((p) => social[p]);
  const isEmpty = !freeClimb;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Identity band */}
      <header className="reveal relative overflow-hidden rounded-2xl border border-border-subtle bg-surface p-6 md:p-8 mb-8">
        <div className="topo pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div
          className="ground-gradient pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-30"
          aria-hidden="true"
        />
        <div className="altimeter pointer-events-none absolute left-0 inset-y-0 w-6 opacity-60" aria-hidden="true" />
        <div className="relative">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
            [ creator ]
          </p>
          <h1 className="font-display text-4xl md:text-5xl text-text-primary mt-2">
            {name}
          </h1>
          <p className="font-mono text-sm text-text-secondary mt-1">@{username}</p>

          {linked.length > 0 && (
            <ul className="flex flex-wrap gap-2 mt-5">
              {linked.map((p) => {
                const h = social[p]!;
                return (
                  <li key={p}>
                    <a
                      href={profileUrl(p, h)}
                      target="_blank"
                      rel="noopener nofollow"
                      aria-label={`${name} on ${PLATFORM_META[p].label}, ${handleDisplay(h)} (opens in new tab)`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface/60 px-3 min-h-[44px] font-mono text-xs text-text-secondary hover:text-signal hover:border-signal/50 transition-colors"
                    >
                      <SocialMark platform={p} className="h-4 w-4 shrink-0" />
                      {handleDisplay(h)}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </header>

      {isEmpty ? (
        <div className="rounded-2xl border border-border-subtle bg-surface/40 p-10 text-center">
          <p className="font-display text-2xl text-text-primary">Nothing plotted yet</p>
          <p className="text-sm text-text-secondary mt-2">
            @{username} hasn’t logged a climb yet.
          </p>
        </div>
      ) : (
        <>
          {/* Climbing */}
          <section aria-labelledby="creator-climbs">
            <h2
              id="creator-climbs"
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-secondary mb-3"
            >
              Climbing
            </h2>
            {freeClimb ? (
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle mb-4">
                <Stat label="Best height" value={formatAltitudeLabel(freeClimb.peakY, 1)} accent />
                <Stat label="Rank" value={`#${freeClimb.rank}`} isTop={freeClimb.rank === 1} />
                <Stat label="Wins" value={String(freeClimb.wins)} />
              </div>
            ) : (
              <p className="text-sm text-text-secondary mb-4">Hasn’t climbed yet.</p>
            )}

            {replays.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {replays.slice(0, 8).map((r) =>
                  r.replayToken ? (
                    <li key={r.id}>
                      <Link
                        href={`/play?r=${encodeURIComponent(r.replayToken)}`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs rounded-full border border-border-strong px-3 py-1.5 text-text-secondary hover:text-signal hover:border-signal/50 transition-colors"
                        aria-label={`Watch replay — peak ${formatAltitudeLabel(r.peakY, 1)}`}
                      >
                        <span aria-hidden="true">▶ {formatAltitudeLabel(r.peakY, 1)}</span>
                      </Link>
                    </li>
                  ) : null
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
  isTop = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  isTop?: boolean;
}) {
  return (
    <div className={`bg-surface px-4 py-3.5 ${isTop ? "shadow-signal" : ""}`}>
      <div className="font-mono text-[10px] text-text-muted uppercase tracking-[0.12em] mb-1.5">
        {label}
      </div>
      <div
        className={[
          "text-lg font-mono font-bold tabular-nums",
          accent || isTop ? "text-signal" : "text-text-primary",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
