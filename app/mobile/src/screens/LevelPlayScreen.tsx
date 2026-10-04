import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { TICK_HZ } from "@app/game/types";

import { useLevels } from "../contexts/LevelsContext";
import { useGuest } from "../contexts/GuestContext";
import { isGuestLocked } from "../lib/levels/guestClient";
import { tapLight, notifySuccess } from "../lib/haptics";
import {
  type LevelNode,
  type LevelResult,
  type LevelRunReport,
  type LevelTicket,
} from "../lib/levels/model";
import { REFUSAL_COPY } from "../components/levels/LevelStartSheet";
import { useLivesRefillOffer } from "../components/levels/useLivesRefillOffer";
import { LevelRun } from "../components/levels/LevelRun";
import { levelRunSetup } from "../lib/levels/catalog";
import { parseStartPowerUp } from "../lib/levels/httpClient";
import { bestFailMarker, nearMissHeadline } from "../lib/levels/nearMiss";
import { tutorialTopicsFor, type TutorialTopic } from "@app/game/levels/tutorial";
import { markTutorialsSeen, unseenTutorials } from "../lib/levels/tutorialSeen";
import { holdLiveTicket, isTicketLive, noteRunStarted, releaseLiveTicket } from "../lib/levels/runNote";
import { LevelTutorial } from "../components/levels/LevelTutorial";
import {
  LevelResultCard,
  PracticeResultCard,
  SubmitFailedCard,
} from "../components/levels/LevelResultCard";

/** Narrows router state to a ticket for this level; anything else is ignored. */
export function ticketFromState(state: unknown, level: number): LevelTicket | null {
  if (typeof state !== "object" || state === null || !("ticket" in state)) return null;
  const t = (state as { ticket: unknown }).ticket;
  if (typeof t !== "object" || t === null) return null;
  const o = t as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    o.level !== level ||
    typeof o.seed !== "string" ||
    typeof o.goalFt !== "number" ||
    typeof o.pars !== "object" ||
    o.pars === null ||
    typeof o.player !== "object" ||
    o.player === null
  ) {
    return null;
  }
  const startPowerUp = parseStartPowerUp(o.startPowerUp);
  if (startPowerUp === undefined) return null;
  return { ...(t as LevelTicket), startPowerUp };
}

type Stage =
  | { kind: "play" }
  | { kind: "saving"; report: LevelRunReport }
  | { kind: "result"; result: LevelResult }
  | { kind: "failed"; report: LevelRunReport }
  | { kind: "practice-over"; report: LevelRunReport };

/**
 * One level run: the climb on the level's fixed seed with a summit goal and
 * star times on the HUD, then the win or lose card. A normal run carries the
 * server's ticket in router state (the life is already spent); `?practice=1`
 * is the lives-free practice of the level, which saves nothing.
 */
export function LevelPlayScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [search] = useSearchParams();
  const practice = search.get("practice") === "1";
  const level = Number(params.level);
  const { client, season, setPlayer, refresh, bestFails, runNotes } = useLevels();
  const refill = useLivesRefillOffer();
  const seasonNo = season?.season ?? null;
  const node: LevelNode | null =
    season && Number.isInteger(level) && level >= 1 && level <= season.levels.length
      ? season.levels[level - 1]
      : null;

  // Only a ticket this session issued and has not left: after a page reload,
  // or browser Back then Forward, history.state still holds the old one, and
  // replaying it would be a free retry.
  const [ticket, setTicket] = useState<LevelTicket | null>(() => {
    const fromState = ticketFromState(location.state, level);
    return fromState && isTicketLive(fromState.id) ? fromState : null;
  });
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: "play" });
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [tutorial, setTutorial] = useState<TutorialTopic[] | null>(null);

  // A guest never plays above the taster, Practice included: the map opens
  // its sign-in prompt for the level instead.
  const guestLocked = useGuest() !== null && isGuestLocked(level);
  // A normal run needs a ticket; without one (reload, app restart, stale
  // link) go back to the level's card, which says the run was interrupted,
  // rather than play a run nobody can score.
  const missing = guestLocked || (!practice && ticket === null);
  useEffect(() => {
    if (!missing) return;
    if (guestLocked) {
      navigate("/", { replace: true, state: { openLevel: level } });
      return;
    }
    const openLevel = Number.isInteger(level) && level >= 1 ? level : undefined;
    navigate("/", { replace: true, state: { openLevel, interrupted: true } });
  }, [missing, guestLocked, level, navigate]);

  const ticketId = ticket?.id ?? null;
  // Leaving the play route any way but the screen's own buttons (browser Back,
  // Android hardware back) ends the run like Quit: the ticket is no longer
  // live and the note is cleared. Deferred, so StrictMode's dev remount keeps it.
  useEffect(() => {
    if (ticketId === null) return;
    holdLiveTicket(ticketId);
    return () => releaseLiveTicket(ticketId, () => runNotes.clear(ticketId));
  }, [ticketId, runNotes]);

  // Set once the screen is left, so a Retry reply that lands afterwards is not
  // taken for a run still being played. Reset on mount for StrictMode's remount.
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  const toMap = useCallback(
    (openLevel?: number) => {
      void tapLight();
      left.current = true;
      // Leaving on purpose: the player knows how this run ended. The unmount
      // release clears it too, but only after the map has read it.
      if (ticketId !== null) runNotes.clear(ticketId);
      navigate("/", { replace: true, state: openLevel ? { openLevel } : null });
    },
    [navigate, ticketId, runNotes],
  );

  const submit = useCallback(
    async (report: LevelRunReport) => {
      // The near-miss marker is device-only: every lost attempt counts,
      // Practice included, and a clear retires it.
      if (seasonNo !== null) {
        if (report.finished) bestFails.clear(seasonNo, report.level);
        else bestFails.record(seasonNo, report.level, report.peakFt);
      }
      if (practice || !ticket) {
        setStage({ kind: "practice-over", report });
        return;
      }
      setStage({ kind: "saving", report });
      try {
        const result = await client.submitResult(ticket.id, report);
        // Scored: no longer a run in progress. A failed submit keeps the
        // note, so a restart from the failed card still says what happened.
        runNotes.clear(ticket.id);
        setPlayer(result.player);
        // Stars and the frontier changed: refetch before the card offers Next
        // level, so the map it lands on already has the next level open.
        await refresh();
        if (result.cleared) void notifySuccess();
        setStage({ kind: "result", result });
      } catch {
        setStage({ kind: "failed", report });
      }
    },
    [client, practice, ticket, setPlayer, refresh, bestFails, seasonNo, runNotes],
  );

  const retry = useCallback(async () => {
    if (practice) {
      setAttempt((n) => n + 1);
      setAutoStart(true);
      setStage({ kind: "play" });
      return;
    }
    setRetryBusy(true);
    setRetryError(null);
    try {
      const res = await client.startLevel(level);
      if (res.ok) {
        const run = seasonNo !== null && node ? { season: seasonNo, level, costsLife: node.costsLife } : null;
        noteRunStarted(runNotes, res.ticket.id, run, { live: !left.current });
        if (left.current) return;
        setPlayer(res.ticket.player);
        setTicket(res.ticket);
        setAutoStart(true);
        setStage({ kind: "play" });
      } else {
        if (res.player) setPlayer(res.player);
        // Out of lives shows its own panel once the lives count reaches 0.
        if (res.code !== "OUT_OF_LIVES") setRetryError(REFUSAL_COPY[res.code]);
      }
    } catch {
      setRetryError(REFUSAL_COPY.NETWORK);
    } finally {
      setRetryBusy(false);
    }
  }, [client, level, practice, setPlayer, seasonNo, node, runNotes]);

  // The level's tutorial plays once per device before its first run: the
  // basics on level 1, and each ladder obstacle and power-up on the level
  // that introduces it.
  const tutorialLevel = node?.level ?? null;
  const introPowerUp = node?.introPowerUp ?? null;
  const topics = useMemo(
    () => (tutorialLevel === null ? [] : tutorialTopicsFor(tutorialLevel, introPowerUp)),
    [tutorialLevel, introPowerUp],
  );
  const tutorialChecked = useRef(false);
  useEffect(() => {
    if (tutorialChecked.current || tutorialLevel === null || missing) return;
    tutorialChecked.current = true;
    const unseen = unseenTutorials(topics);
    if (unseen.length > 0) setTutorial(unseen);
  }, [tutorialLevel, missing, topics]);
  const closeTutorial = useCallback(() => {
    if (tutorial) markTutorialsSeen(tutorial);
    setTutorial(null);
  }, [tutorial]);

  const runKey = practice ? `practice-${attempt}` : (ticket?.id ?? "none");
  const nodeLevel = node?.level ?? null;
  // The level's own tower and lava, built fresh for each attempt (runKey).
  const setup = useMemo(
    () => (nodeLevel === null ? undefined : levelRunSetup(nodeLevel)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runKey: one tower per attempt
    [nodeLevel, runKey],
  );

  if (missing) return null;
  if (!node) {
    return (
      <div role="status" className="fixed inset-0 z-40 flex items-center justify-center bg-void font-mono text-label uppercase tracking-label text-text-muted">
        Loading level…
      </div>
    );
  }

  const seed = ticket?.seed ?? node.seed;
  const goalFt = ticket?.goalFt ?? node.goalFt;
  const pars = ticket?.pars ?? node.pars;
  const player = season?.player;
  // Read at render. The store only changes when a run ends, so a run in
  // progress keeps the marker it started with.
  const best = seasonNo !== null ? bestFails.get(seasonNo, level) : null;
  const marker = setup ? bestFailMarker(setup.tower, best, goalFt) : null;
  const nearMiss = (peakFt: number) => (setup ? nearMissHeadline(setup.tower, peakFt, goalFt) : null);

  return (
    <div className="fixed inset-0 z-40 bg-void">
      <LevelRun
        key={runKey}
        level={level}
        seed={seed}
        goalFt={goalFt}
        pars={pars}
        setup={setup}
        practice={practice}
        autoStart={autoStart}
        paused={stage.kind !== "play"}
        onEnd={submit}
        onQuit={() => toMap()}
        startPowerUp={practice ? null : (ticket?.startPowerUp ?? null)}
        bestFailFt={marker}
        onHowToPlay={() => setTutorial(topics.length > 0 ? topics : ["basics"])}
      />
      {tutorial && <LevelTutorial topics={tutorial} onDone={closeTutorial} />}

      {stage.kind === "saving" && (
        <div role="status" className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-surface/95 px-6 py-10 text-center font-mono text-label uppercase tracking-label text-text-secondary backdrop-blur-xl">
          Checking your run…
        </div>
      )}
      <AnimatePresence>
        {stage.kind === "result" && (
          <LevelResultCard
            key="result"
            result={player ? { ...stage.result, player } : stage.result}
            costsLife={node.costsLife}
            nearMiss={stage.result.cleared ? null : nearMiss(stage.result.peakFt)}
            hasNextLevel={season !== null && level < season.levels.length}
            retryBusy={retryBusy}
            retryError={retryError}
            onNext={() => toMap(level + 1)}
            onRetry={() => void retry()}
            onMap={() => toMap()}
            onPractice={() => navigate("/climb", { replace: true })}
            onPracticeLevel={() => navigate(`/levels/${level}/play?practice=1`, { replace: true })}
            refill={refill.offer}
          />
        )}
        {stage.kind === "failed" && (
          <SubmitFailedCard key="failed" level={level} busy={false} onRetry={() => void submit(stage.report)} onMap={() => toMap()} />
        )}
        {stage.kind === "practice-over" && (
          <PracticeResultCard
            key="practice"
            level={level}
            goalFt={goalFt}
            peakFt={stage.report.peakFt}
            outOfTime={stage.report.outOfTime}
            nearMiss={stage.report.finished ? null : nearMiss(stage.report.peakFt)}
            timeMs={stage.report.finishedTick !== null ? Math.round((stage.report.finishedTick / TICK_HZ) * 1000) : null}
            onRetry={() => void retry()}
            onMap={() => toMap()}
          />
        )}
      </AnimatePresence>
      {refill.overlays}
    </div>
  );
}
