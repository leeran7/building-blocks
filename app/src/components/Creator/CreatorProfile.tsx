/**
 * CreatorProfile — the public /c/[username] body.
 *
 * Read-only view of a creator's paid listings and climbing record. All data is
 * already public (visible blocks + the public climb leaderboard). Listings link
 * to their permanent record page; climb replays link to the deterministic
 * /play?r=… replay. ASCENT design tokens throughout.
 */

import Link from "next/link";
import { ALTITUDE_UNIT, formatAltitudeLabel } from "../../lib/units";
import { getCategory } from "../../lib/categories";
import { SocialMark } from "../Social/SocialMark";
import { PLATFORM_META, handleDisplay } from "../../lib/socialHandle";
import type { CreatorProfile as CreatorProfileData } from "../../db/creator";

export function CreatorProfile({ profile }: { profile: CreatorProfileData }) {
  const { name, username, blocks, freeClimb, replays } = profile;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
          [ creator ]
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-text-primary mt-2">
          {name}
        </h1>
        <p className="font-mono text-sm text-text-muted mt-1">@{username}</p>
      </header>

      {/* Listings */}
      <section aria-labelledby="creator-listings" className="mb-10">
        <h2
          id="creator-listings"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3"
        >
          Listings
        </h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-text-secondary">No live listings right now.</p>
        ) : (
          <ul className="space-y-2">
            {blocks.map((b) => {
              const cat = getCategory(b.category);
              return (
                <li key={b.slug}>
                  <Link
                    href={`/b/${b.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/40 hover:bg-elevated hover:border-border-strong px-3 py-3 transition-colors"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-text-primary truncate">
                        {b.display_name}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-mono text-text-muted truncate mt-0.5">
                        {b.platform && b.handle ? (
                          <>
                            <SocialMark
                              platform={b.platform}
                              className="h-3.5 w-3.5 flex-shrink-0"
                            />
                            <span className="truncate">
                              {PLATFORM_META[b.platform].label} · {handleDisplay(b.handle)}
                            </span>
                          </>
                        ) : (
                          <span className="truncate">{cat.label}</span>
                        )}
                      </span>
                    </span>
                    <span
                      className="font-mono text-sm font-bold tabular-nums text-signal flex-shrink-0"
                      aria-label={`Altitude ${formatAltitudeLabel(b.altitude, 1)}`}
                    >
                      {b.altitude.toFixed(1)}
                      <span className="text-text-muted font-normal ml-0.5">
                        {ALTITUDE_UNIT}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Climbing */}
      <section aria-labelledby="creator-climbs">
        <h2
          id="creator-climbs"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3"
        >
          Climbing
        </h2>
        {freeClimb ? (
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle mb-4">
            <Stat label="Best height" value={formatAltitudeLabel(freeClimb.peakY, 1)} accent />
            <Stat label="Rank" value={`#${freeClimb.rank}`} />
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
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="font-mono text-[10px] text-text-muted uppercase tracking-[0.12em] mb-1.5">
        {label}
      </div>
      <div
        className={[
          "text-lg font-mono font-bold tabular-nums",
          accent ? "text-signal" : "text-text-primary",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
