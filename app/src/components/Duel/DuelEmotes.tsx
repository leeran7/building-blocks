"use client";

/**
 * Duel emotes and quick messages.
 *
 * A round button on the stage opens a tray: a 3×3 wheel of 3D props and the
 * quick messages for this moment of the duel, each with its prop beside it.
 * Sending one pops it up large over the stage for both players, lit lime for
 * you and blue for the opponent, with a sting. The last prop you sent sits
 * next to the button so a reply is one tap. Shared by the web duel room and
 * the native app.
 *
 * Only catalog ids go over the wire (net/emotes.ts). Both ends rate-limit;
 * the button shows the cooldown as a ring. Either player can mute the other,
 * and that choice persists on the device.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { RealtimeHandle } from "../../net/realtime";
import {
  createEmoteGate,
  EMOTE_MIN_GAP_MS,
  EMOTE_PROPS,
  quickMessagesFor,
  type DuelMoment,
  type Emote,
} from "../../net/emotes";
import { EmoteStageProvider, EmoteView } from "./emotes3d/EmoteView";
import { playEmoteSting, unlockEmoteAudio } from "./emoteAudio";
import "./duelEmotes.css";

const MUTE_KEY = "doomstack:emotes-muted";
const LAST_KEY = "doomstack:emotes-last";
/** How long a bubble stays up (ms). The 3D prop pops away over its last 350 ms. */
export const BUBBLE_MS = 3200;

interface Bubble {
  key: number;
  emote: Emote;
}

export interface DuelEmotesProps {
  realtime: RealtimeHandle;
  myId: string;
  opponentName: string;
  /** Which quick messages sit nearest the thumb. */
  moment?: DuelMoment;
  /** "stage": over the game canvas. "screen": fixed over a full page (result screens). */
  layer?: "stage" | "screen";
  /** Safe-area insets so the button clears the notch and home indicator. */
  topInset?: number;
  rightInset?: number;
  bottomInset?: number;
  /** Game sound is muted: stings stay silent, the props still show. */
  soundMuted?: boolean;
  /** Native taptics hooks. */
  onSend?: () => void;
  onReceive?: () => void;
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function readLast(): Emote | null {
  try {
    const id = localStorage.getItem(LAST_KEY);
    return EMOTE_PROPS.find((e) => e.id === id) ?? null;
  } catch {
    return null;
  }
}

function prefersStill(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Let go of focus after a tap so the game's keyboard controls keep working (they ignore keys aimed at a button). */
function releaseFocus(e: MouseEvent<HTMLElement>) {
  e.currentTarget.blur();
}

export function DuelEmotes({
  realtime,
  myId,
  opponentName,
  moment = "climb",
  layer = "stage",
  topInset = 0,
  rightInset = 0,
  bottomInset = 0,
  soundMuted = false,
  onSend,
  onReceive,
}: DuelEmotesProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Bubble | null>(null);
  const [theirs, setTheirs] = useState<Bubble | null>(null);
  const [muted, setMuted] = useState(() => readFlag(MUTE_KEY));
  const [last, setLast] = useState<Emote | null>(readLast);
  const [cooldown, setCooldown] = useState<{ until: number; ms: number } | null>(null);
  const [nope, setNope] = useState(0);
  const [still] = useState(prefersStill);
  const sendGate = useRef(createEmoteGate());
  const recvGate = useRef(createEmoteGate());
  const keyRef = useRef(0);
  const mutedRef = useRef(muted);
  const soundMutedRef = useRef(soundMuted);
  const onReceiveRef = useRef(onReceive);

  useEffect(() => {
    mutedRef.current = muted;
    soundMutedRef.current = soundMuted;
    onReceiveRef.current = onReceive;
  }, [muted, soundMuted, onReceive]);

  useEffect(
    () =>
      realtime.onEmote((emote, clientId) => {
        // Our own sends echo back; we already showed them.
        if (clientId === myId || mutedRef.current) return;
        if (!recvGate.current.tryTake(Date.now())) return;
        keyRef.current += 1;
        setTheirs({ key: keyRef.current, emote });
        if (!soundMutedRef.current) playEmoteSting(emote.prop);
        onReceiveRef.current?.();
      }),
    [realtime, myId]
  );

  useEffect(() => {
    if (!mine) return;
    const t = setTimeout(() => setMine((b) => (b?.key === mine.key ? null : b)), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [mine]);
  useEffect(() => {
    if (!theirs) return;
    const t = setTimeout(() => setTheirs((b) => (b?.key === theirs.key ? null : b)), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [theirs]);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown(null), Math.max(0, cooldown.until - Date.now()));
    return () => clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (!nope) return;
    const t = setTimeout(() => setNope(0), 400);
    return () => clearTimeout(t);
  }, [nope]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    (emote: Emote) => {
      setOpen(false);
      const now = Date.now();
      if (!sendGate.current.tryTake(now)) {
        setNope((n) => n + 1);
        const wait = sendGate.current.waitMs(now);
        if (wait > 0) setCooldown({ until: now + wait, ms: wait });
        return;
      }
      realtime.publishEmote({ id: emote.id });
      keyRef.current += 1;
      setMine({ key: keyRef.current, emote });
      setCooldown({ until: now + EMOTE_MIN_GAP_MS, ms: EMOTE_MIN_GAP_MS });
      if (emote.kind === "emote") {
        setLast(emote);
        try {
          localStorage.setItem(LAST_KEY, emote.id);
        } catch {
          /* fine: the shortcut just won't survive a reload */
        }
      }
      if (!soundMutedRef.current) playEmoteSting(emote.prop);
      onSend?.();
    },
    [realtime, onSend]
  );

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable: mute lasts this match */
      }
      return next;
    });
    setTheirs(null);
  }, []);

  const lines = quickMessagesFor(moment);
  const cooling = cooldown !== null;

  return (
    <div
      ref={layerRef}
      className="emo-layer"
      data-layer={layer}
      style={{
        ["--emo-top" as string]: `${topInset}px`,
        ["--emo-right" as string]: `${rightInset}px`,
        ["--emo-bottom" as string]: `${bottomInset}px`,
      }}
    >
      <EmoteStageProvider host={layerRef} canvasClassName="emo-gl">
        {theirs && <EmoteBubble key={theirs.key} emote={theirs.emote} side="them" name={opponentName} still={still} />}
        {mine && <EmoteBubble key={mine.key} emote={mine.emote} side="me" name="You" still={still} />}

        {open && (
          <button type="button" className="emo-scrim" aria-label="Close emotes" tabIndex={-1} onClick={() => setOpen(false)} />
        )}

        <div className="emo-dock">
          {last && !open && (
            <button
              type="button"
              data-game-control
              className="emo-again"
              aria-label={`Send ${last.label} again`}
              title={`${last.label} again`}
              onClick={(e) => {
                releaseFocus(e);
                unlockEmoteAudio();
                send(last);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <EmoteView prop={last.prop} side="tray" glyph={last.glyph} still className="emo-again-view" />
            </button>
          )}

          <button
            type="button"
            data-game-control
            className="emo-trigger"
            data-open={open || undefined}
            data-cooling={cooling || undefined}
            data-nope={nope || undefined}
            aria-expanded={open}
            aria-haspopup="true"
            aria-label={open ? "Close emotes" : "Send an emote"}
            title="Emotes"
            onClick={(e) => {
              releaseFocus(e);
              unlockEmoteAudio();
              setOpen((o) => !o);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
              <path d="M9 8.5h.01M15 8.5h.01M9 11.5c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5" />
            </svg>
            {cooling && (
              <svg key={cooldown.until} className="emo-cool" viewBox="0 0 48 48" aria-hidden="true" style={{ ["--emo-cool-ms" as string]: `${cooldown.ms}ms` }}>
                <circle cx="24" cy="24" r="22" pathLength="100" />
              </svg>
            )}
          </button>
        </div>

        {open && (
          <div className="emo-tray" role="group" aria-label="Emotes and quick messages">
            <div className="emo-grid" role="group" aria-label="Emotes">
              {EMOTE_PROPS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  data-game-control
                  className="emo-pick"
                  aria-label={e.label}
                  title={e.label}
                  onClick={(ev) => {
                    releaseFocus(ev);
                    send(e);
                  }}
                >
                  <EmoteView prop={e.prop} side="tray" glyph={e.glyph} still={still} className="emo-pick-view" />
                </button>
              ))}
            </div>
            <div className="emo-lines" role="group" aria-label="Quick messages">
              {lines.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  data-game-control
                  className="emo-line"
                  data-now={e.moment === moment || undefined}
                  aria-label={e.label}
                  onClick={(ev) => {
                    releaseFocus(ev);
                    send(e);
                  }}
                >
                  <EmoteView prop={e.prop} side="tray" glyph={e.glyph} still className="emo-line-view" />
                  <span>{e.text}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              data-game-control
              className="emo-mute"
              aria-pressed={muted}
              onClick={(ev) => {
                releaseFocus(ev);
                toggleMuted();
              }}
            >
              {muted ? `Show ${opponentName}'s emotes` : `Mute ${opponentName}`}
            </button>
          </div>
        )}
      </EmoteStageProvider>
    </div>
  );
}

function EmoteBubble({ emote, side, name, still }: { emote: Emote; side: "me" | "them"; name: string; still: boolean }) {
  return (
    <div className="emo-bubble" data-side={side} data-kind={emote.kind} role="status" aria-live="polite">
      <span className="emo-bubble-name" aria-hidden="true">{name}</span>
      <div className="emo-bubble-body" aria-hidden="true">
        <EmoteView prop={emote.prop} side={side} glyph={emote.glyph} durationMs={BUBBLE_MS} still={still} className="emo-bubble-view" />
        {emote.kind === "message" ? (
          <span className="emo-bubble-plate">{emote.text}</span>
        ) : (
          <span className="emo-bubble-caption">{emote.label}</span>
        )}
      </div>
      <span className="emo-sr">{`${name}: ${emote.label}`}</span>
    </div>
  );
}
