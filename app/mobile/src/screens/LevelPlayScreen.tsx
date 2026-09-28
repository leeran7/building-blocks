import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { TICK_HZ } from "@app/game/types";

import { useLevels } from "../contexts/LevelsContext";
import { tapLight, notifySuccess } from "../lib/haptics";
import {
  type LevelNode,
  type LevelResult,
  type LevelRunReport,
  type LevelTicket,
} from "../lib/levels/model";
import { REFUSAL_COPY } from "../components/levels/LevelStartSheet";
import { LevelRun } from "../components/levels/LevelRun";
import { levelRunSetup } from "../lib/levels/catalog";
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
  return t as LevelTicket;
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
  const { client, season, setPlayer, refresh } = useLevels();
  const node: LevelNode | null =
    season && Number.isInteger(level) && level >= 1 && level <= season.levels.length
      ? season.levels[level - 1]
      : null;

  const [ticket, setTicket] = useState<LevelTicket | null>(() => ticketFromState(location.state, level));
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: "play" });
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [autoStart, setAutoStart] = useState(false);

  // A normal run needs a ticket; without one (app restart, stale link) go
  // back to the map rather than play a run nobody can score.
  const missing = !practice && ticket === null;
  useEffect(() => {
    if (missing) navigate("/", { replace: true });
  }, [missing, navigate]);

  const toMap = useCallback(
    (openLevel?: number) => {
      void tapLight();
      navigate("/", { replace: true, state: openLevel ? { openLevel } : null });
    },
    [navigate],
  );

  const submit = useCallback(
    async (report: LevelRunReport) => {
      if (practice || !ticket) {
        setStage({ kind: "practice-over", report });
        return;
      }
      setStage({ kind: "saving", report });
      try {
        const result = await client.submitResult(ticket.id, report);
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
    [client, practice, ticket, setPlayer, refresh],
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
  }, [client, level, practice, setPlayer]);

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
      />

      {stage.kind === "saving" && (
        <div role="status" className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-surface/95 px-6 py-10 text-center font-mono text-label uppercase tracking-label text-text-secondary backdrop-blur-xl">
          Checking your run…
        </div>
      )}
      {stage.kind === "result" && (
        <LevelResultCard
          result={player ? { ...stage.result, player } : stage.result}
          costsLife={node.costsLife}
          hasNextLevel={season !== null && level < season.levels.length}
          retryBusy={retryBusy}
          retryError={retryError}
          onNext={() => toMap(level + 1)}
          onRetry={() => void retry()}
          onMap={() => toMap()}
          onPractice={() => navigate("/climb", { replace: true })}
          onPracticeLevel={() => navigate(`/levels/${level}/play?practice=1`, { replace: true })}
        />
      )}
      {stage.kind === "failed" && (
        <SubmitFailedCard level={level} busy={false} onRetry={() => void submit(stage.report)} onMap={() => toMap()} />
      )}
      {stage.kind === "practice-over" && (
        <PracticeResultCard
          level={level}
          goalFt={goalFt}
          peakFt={stage.report.peakFt}
          outOfTime={stage.report.outOfTime}
          timeMs={stage.report.finishedTick !== null ? Math.round((stage.report.finishedTick / TICK_HZ) * 1000) : null}
          onRetry={() => void retry()}
          onMap={() => toMap()}
        />
      )}
    </div>
  );
}
