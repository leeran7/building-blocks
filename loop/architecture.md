# Architecture: 1v1 Quick Play on Mobile

**Goal ID:** mobile-quick-play
**Spec:** `loop/spec.md` (AC-1 through AC-8)
**Stack:** Capacitor 8 + Vite React SPA, React 19, Tailwind CSS 4, react-router-dom v7
**Date:** 2026-09-19

## 1. AC to architectural need

| ACs | Need |
|-----|------|
| AC-1 | New QuickPlayCard component on HomeScreen using existing ModeCard |
| AC-2, AC-3, AC-8 | Queue state machine hook: join (POST), poll (GET ~2s), handle matched/waiting/409 |
| AC-4, NFR-5 | Cancel flow: DELETE + cleanup intervals on unmount |
| AC-5 | Timeout detection: handle "expired" poll status |
| AC-6 | Error handling: network errors, non-2xx responses |
| AC-7 | Haptics: tapMedium on join, tapLight on cancel, notifySuccess on match |

## 2. Stack confirmation

- **React 19 + react-router-dom v7 (HashRouter)**: already in use; no change
- **apiFetch from mobile/src/lib/api.ts**: already handles Bearer token; no change
- **Haptics from mobile/src/lib/haptics.ts**: already exported; no change
- **Not choosing**: No new state management library; React hooks are sufficient.
  No WebSocket/SSE -- the web uses polling and the backend is designed for it.

## 3. Data flow

```
HomeScreen
  |
  +-- QuickPlayCard (ModeCard with bolt icon)
  |     |
  |     +-- onPress -> useMatchmakingQueue.join()
  |
  +-- SearchingOverlay (conditionally rendered when queue.status !== "idle")
        |
        +-- Shows spinner, status text, cancel button
        +-- On match: navigate("/duel/${duelId}")
        +-- On cancel: useMatchmakingQueue.cancel()

useMatchmakingQueue hook:
  join() -> POST /api/duel/queue { categorySlug: "tech" }
    |
    +-- 200 { status: "waiting" } -> start polling
    +-- 200 { status: "matched", duelId } -> navigate immediately
    +-- 409 ALREADY_QUEUED -> start polling (resume)
    +-- 429/5xx/network -> error state
    |
  poll (setInterval ~2s) -> GET /api/duel/queue
    |
    +-- { status: "matched", duelId } -> stop poll, set matched
    +-- { status: "waiting" } -> continue
    +-- { status: "expired" } -> stop poll, set timeout
    +-- { status: "idle" } -> stop poll, set timeout (slot vanished)
    |
  cancel() -> DELETE /api/duel/queue (best-effort)
    +-- stop poll, reset to idle
```

## 4. New files

| File | Purpose |
|------|---------|
| `app/mobile/src/hooks/useMatchmakingQueue.ts` | Queue state machine hook |

## 5. Modified files

| File | Change |
|------|--------|
| `app/mobile/src/screens/HomeScreen.tsx` | Add QuickPlayCard + SearchingOverlay + BoltIcon |

## 6. API contract (existing, no changes)

### POST /api/duel/queue
- Auth: Bearer token (required)
- Body: `{ categorySlug: "tech" }`
- 200: `{ status: "waiting" }` or `{ status: "matched", duelId: string }`
- 409: `{ error: "Already in queue", code: "ALREADY_QUEUED" }`
- 429: `{ error: "Too many requests", code: "RATE_LIMITED" }`

### GET /api/duel/queue
- Auth: Bearer token (required)
- 200: `{ status: "matched", duelId: string }` | `{ status: "waiting" }` | `{ status: "expired" }` | `{ status: "idle" }`

### DELETE /api/duel/queue
- Auth: Bearer token (required)
- 200: `{ status: "cancelled" }`
- 404: `{ error: "Not in queue", code: "NOT_IN_QUEUE" }`

## 7. Queue state type

```typescript
type QueueStatus = "idle" | "joining" | "searching" | "matched" | "timeout" | "error";

interface QueueState {
  status: QueueStatus;
  duelId: string | null;
  errorMessage: string | null;
}
```

## 8. Hook API

```typescript
interface UseMatchmakingQueue {
  state: QueueState;
  join: () => void;
  cancel: () => void;
  reset: () => void;
}
```

- `join()`: POST to queue, transition to "joining" then "searching" or "matched"
- `cancel()`: DELETE (best-effort), stop polling, reset to "idle"
- `reset()`: Reset from timeout/error back to "idle"
- Cleanup: on unmount, stop polling and DELETE if still searching

## 9. Failure modes

| Dependency | Failure | Handling |
|-----------|---------|----------|
| Network (POST) | Timeout/error | Show error state with retry |
| Network (GET poll) | Single failure | Ignore, next tick recovers |
| Network (DELETE) | Failure | Best-effort, UI resets anyway |
| Queue TTL (server) | 300s expiry | Poll returns "expired", show timeout |
| Rate limit (429) | Too many joins | Show "Too many requests" error |

## 10. ADRs

### ADR-1: Hook vs context for queue state

**Decision:** Custom hook (`useMatchmakingQueue`) colocated with HomeScreen.
**Rationale:** Queue state is only relevant to HomeScreen; no other screen needs
it. A context would be premature. The hook encapsulates all side effects
(intervals, fetch, cleanup) and the state machine.

### ADR-2: Full-screen overlay vs inline card expansion

**Decision:** Full-screen overlay rendered conditionally inside HomeScreen.
**Rationale:** The web uses an inline panel, but mobile benefits from a
full-screen takeover that (a) prevents accidental navigation during search,
(b) provides a large, unambiguous cancel target, and (c) reads as a game
loading screen rather than a form. The overlay is not a route -- it is
conditionally rendered JSX gated on queue state, so back-navigation works
naturally.

### ADR-3: Polling interval and cleanup

**Decision:** 2000ms setInterval, cleared on cancel/unmount/match. Best-effort
DELETE on unmount cleanup.
**Rationale:** Matches the web implementation. The server's poll rate limit is
900/hour, which supports ~2s intervals for 300s (150 polls, well under ceiling).
