"use client";

/**
 * Duel emotes and quick messages: a round button that opens a tray of emoji
 * and canned lines, and the speech bubbles that pop up when either player
 * sends one. Shared by the web duel room and the native app.
 *
 * Only catalog ids go over the wire (net/emotes.ts). Both ends rate-limit,
 * and either player can mute the other's emotes; that choice persists on the
 * device.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { RealtimeHandle } from "../../net/realtime";
import { createEmoteGate, EMOTES, type Emote } from "../../net/emotes";
import "./duelEmotes.css";

const MUTE_KEY = "doomstack:emotes-muted";
/** How long a bubble stays up (ms). Matches the CSS animation. */
export const BUBBLE_MS = 2600;

interface Bubble {
  key: number;
  emote: Emote;
}

export interface DuelEmotesProps {
  realtime: RealtimeHandle;
  myId: string;
  opponentName: string;
  /** "stage": over the game canvas. "screen": fixed over a full page (result screens). */
  layer?: "stage" | "screen";
  /** Safe-area insets so the button clears the notch and home indicator. */
  topInset?: number;
  rightInset?: number;
  bottomInset?: number;
  /** Native taptics hooks. */
  onSend?: () => void;
  onReceive?: () => void;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
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
  layer = "stage",
  topInset = 0,
  rightInset = 0,
  bottomInset = 0,
  onSend,
  onReceive,
}: DuelEmotesProps) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Bubble | null>(null);
  const [theirs, setTheirs] = useState<Bubble | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const [cooling, setCooling] = useState(false);
  const sendGate = useRef(createEmoteGate());
  const recvGate = useRef(createEmoteGate());
  const keyRef = useRef(0);
  const mutedRef = useRef(muted);
  const onReceiveRef = useRef(onReceive);

  useEffect(() => {
    mutedRef.current = muted;
    onReceiveRef.current = onReceive;
  }, [muted, onReceive]);

  useEffect(
    () =>
      realtime.onEmote((emote, clientId) => {
        // Our own sends echo back; we already showed them.
        if (clientId === myId || mutedRef.current) return;
        if (!recvGate.current.tryTake(Date.now())) return;
        keyRef.current += 1;
        setTheirs({ key: keyRef.current, emote });
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
    if (!cooling) return;
    const t = setTimeout(() => setCooling(false), 400);
    return () => clearTimeout(t);
  }, [cooling]);

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
      if (!sendGate.current.tryTake(Date.now())) {
        setCooling(true);
        return;
      }
      realtime.publishEmote({ id: emote.id });
      keyRef.current += 1;
      setMine({ key: keyRef.current, emote });
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
        /* storage unavailable — mute lasts this match */
      }
      return next;
    });
    setTheirs(null);
  }, []);

  const emoji = EMOTES.filter((e) => e.kind === "emote");
  const lines = EMOTES.filter((e) => e.kind === "message");

  return (
    <div
      className="emo-layer"
      data-layer={layer}
      style={{
        ["--emo-top" as string]: `${topInset}px`,
        ["--emo-right" as string]: `${rightInset}px`,
        ["--emo-bottom" as string]: `${bottomInset}px`,
      }}
    >
      {theirs && <EmoteBubble key={theirs.key} emote={theirs.emote} side="them" name={opponentName} />}
      {mine && <EmoteBubble key={mine.key} emote={mine.emote} side="me" name="You" />}

      {open && (
        <button
          type="button"
          className="emo-scrim"
          aria-label="Close emotes"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}

      <button
        type="button"
        data-game-control
        className="emo-trigger"
        data-open={open || undefined}
        data-cooling={cooling || undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? "Close emotes" : "Send an emote"}
        title="Emotes"
        onClick={(e) => {
          releaseFocus(e);
          setOpen((o) => !o);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
          <path d="M9 8.5h.01M15 8.5h.01M9 11.5c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5" />
        </svg>
      </button>

      {open && (
        <div className="emo-tray" role="group" aria-label="Emotes and quick messages">
          <div className="emo-grid">
            {emoji.map((e) => (
              <button
                key={e.id}
                type="button"
                data-game-control
                className="emo-pick"
                aria-label={e.label}
                onClick={(ev) => {
                  releaseFocus(ev);
                  send(e);
                }}
              >
                <span aria-hidden="true">{e.text}</span>
              </button>
            ))}
          </div>
          <div className="emo-lines">
            {lines.map((e) => (
              <button
                key={e.id}
                type="button"
                data-game-control
                className="emo-line"
                onClick={(ev) => {
                  releaseFocus(ev);
                  send(e);
                }}
              >
                {e.text}
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
    </div>
  );
}

function EmoteBubble({ emote, side, name }: { emote: Emote; side: "me" | "them"; name: string }) {
  return (
    <div className="emo-bubble" data-side={side} data-kind={emote.kind} role="status" aria-live="polite">
      <span className="emo-bubble-name" aria-hidden="true">{name}</span>
      <span className="emo-bubble-body" aria-hidden="true">{emote.text}</span>
      <span className="emo-sr">{`${name}: ${emote.label}`}</span>
    </div>
  );
}
