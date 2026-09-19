# QA Acceptance Report -- 1v1 Quick Play (mobile-quick-play)

**Date:** 2026-09-19
**Feature:** Quick Play random 1v1 matchmaking on mobile HomeScreen
**ACs:** AC-1 through AC-11
**Verdict:** PASS -> integrator

## Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| app-typecheck | PASS | `pnpm typecheck` exits 0, no output |
| app-test | PASS | 78 files, 707 tests, 0 failures |
| hook tests | PASS | 26 tests in useMatchmakingQueue.test.ts, all pass |

## Acceptance Criteria

### AC-1: Quick Play card visible on HomeScreen -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Position | Static read | Between Daily Climb and Challenge | DailyCard, QuickPlayCard, ChallengeCard in order | HomeScreen.tsx:162-168 |
| ModeCard usage | Static read | Uses ModeCard component | QuickPlayCard renders ModeCard | HomeScreen.tsx:393-401 |
| BoltIcon | Static read | Bolt/lightning icon | BoltIcon SVG with lightning path | HomeScreen.tsx:379-385 |
| tint="signal" | Static read | Signal-lime tint | tint="signal" | HomeScreen.tsx:395 |
| Title | Static read | "Quick Play" | "Quick Play" | HomeScreen.tsx:396 |
| Subtitle | Static read | "Find a random opponent" | "Find a random opponent" | HomeScreen.tsx:397 |

### AC-2: Tapping Quick Play joins queue and shows SearchingOverlay -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| POST endpoint | Automated | /api/duel/queue | /api/duel/queue | Hook line 102, test line 156 |
| POST body | Automated | { categorySlug: "tech" } | Matches | Hook line 105, test line 159 |
| Overlay renders | Static read | Full-screen overlay | fixed inset-0 z-50 bg-void/95 | HomeScreen.tsx:424 |
| Spinner | Static read | Animated spinner | animate-spin rounded-full border | HomeScreen.tsx:443 |
| Status text | Static read | "Searching for opponent" | "Searching for opponent" | HomeScreen.tsx:447 |
| Cancel button | Static read | Cancel button present | Cancel button with onCancel | HomeScreen.tsx:452-457 |

### AC-3: Polling finds match and navigates -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Poll interval | Automated | 2000ms | POLL_INTERVAL_MS = 2000 | Hook line 38, test advances 2000ms |
| Poll endpoint | Automated | GET /api/duel/queue | apiFetch("/api/duel/queue") | Hook line 66 |
| Match detection | Automated | status=matched + duelId | Checked at hook line 72 | Test line 176-181 |
| Navigation | Static read | navigate(/duel/:duelId) | navigate(`/duel/${duelId}`) | HomeScreen.tsx:117 |
| Route exists | Static read | /duel/:id -> DuelRoomScreen | Route at App.tsx:59 | App.tsx |

### AC-4: Cancel leaves queue -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Stops polling | Automated | Interval cleared | stopPolling() called | Hook line 177, test line 454-459 |
| DELETE sent | Automated | DELETE /api/duel/queue | Best-effort DELETE | Hook line 182, test line 449-451 |
| Returns idle | Automated | status=idle | setState(IDLE_STATE) | Hook line 178, test line 443-446 |
| No DELETE from idle | Automated | No DELETE when not in queue | inQueueRef guard | Test line 466-480 |

### AC-5: Timeout shows retry -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Expired -> timeout | Automated | status=timeout | Hook lines 80-84 | Test line 309-341 |
| Idle -> timeout | Automated | status=timeout | Hook lines 80-84 | Test line 345-374 |
| "No opponent found" | Static read | Text present | "No opponent found" | HomeScreen.tsx:464 |
| "Search again" button | Static read | Retry button | onRetry callback | HomeScreen.tsx:470-475 |
| "Back" button | Static read | Dismiss button | onDismiss callback | HomeScreen.tsx:476-481 |

### AC-6: Error states show messages -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| 429 message | Automated | Rate limit message | "Too many searches -- give it a minute" | Test line 256-259 |
| Network error | Automated | Connection message | "Network error -- check your connection" | Test line 409-413 |
| Server error body | Automated | Server message | Uses body.error string | Test line 276-280 |
| Fallback message | Automated | Default message | "Could not join queue" | Test line 301-302 |
| "Try again" button | Static read | Retry button present | onRetry callback | HomeScreen.tsx:492-496 |
| "Back" button | Static read | Dismiss button present | onDismiss callback | HomeScreen.tsx:498-503 |

### AC-7: Haptic feedback -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| tapMedium on join | Automated | Called once | void tapMedium() | Hook line 98, test line 754 |
| tapLight on cancel | Automated | Called once | void tapLight() | Hook line 175, test line 776 |
| notifySuccess on match | Automated | Called on match | void notifySuccess() | Hook lines 75,145, test line 181 |
| notifyError on error | Automated | Called on error | void notifyError() | Hook lines 119,130,163, test line 261 |

### AC-8: Accessibility -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| role="dialog" | Static read | Present on overlay | role="dialog" | HomeScreen.tsx:425 |
| aria-modal="true" | Static read | Present on overlay | aria-modal="true" | HomeScreen.tsx:426 |
| sr-only live region | Static read | assertive live region | sr-only p aria-live="assertive" | HomeScreen.tsx:430 |
| Cancel min-h-[48px] | Static read | >= 48px | min-h-[48px] | HomeScreen.tsx:454 |
| Search again min-h-[48px] | Static read | >= 48px | min-h-[48px] | HomeScreen.tsx:472 |
| Back (timeout) min-h-[48px] | Static read | >= 48px | min-h-[48px] | HomeScreen.tsx:478 |
| Try again min-h-[48px] | Static read | >= 48px | min-h-[48px] | HomeScreen.tsx:494 |
| Back (error) min-h-[48px] | Static read | >= 48px | min-h-[48px] | HomeScreen.tsx:500 |

### AC-9: Cleanup on unmount -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Interval cleared | Automated | clearInterval called | Hook line 201-203 | Test line 509-511 |
| DELETE on unmount | Automated | DELETE sent | Hook lines 205-208 | Test line 503-506 |
| No DELETE when idle | Automated | Guard on inQueueRef | Hook line 205 | Test line 516-526 |
| No DELETE after match | Automated | inQueueRef=false on match | Hook line 74 | Test line 530-550 |

### AC-10: Instant match on POST -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Direct to matched | Automated | No polling started | Hook lines 142-148 | Test line 189-208 |
| notifySuccess fires | Automated | Haptic on instant match | Hook line 145 | Test line 205 |
| duelId set | Automated | duelId from response | "instant-456" | Test line 201-204 |

### AC-11: 409 resumes polling -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Searching state | Automated | status=searching | Hook line 113 | Test line 221 |
| Polling starts | Automated | startPolling called | Hook line 114 | Test lines 224-239 |
| No error shown | Automated | No error state | No errorMessage set | Test line 221 |

## User Flow Validation

### F-1: Join Queue (Happy Path) -- PASS
**Method:** Code trace + automated test
**Result:** QuickPlayCard.onPress -> queue.join -> POST /api/duel/queue -> SearchingOverlay -> poll every 2s -> matched -> navigate(/duel/:id). Full path verified by test "transitions through joining -> searching -> matched when polled".

### F-2: Instant Match -- PASS
**Method:** Code trace + automated test
**Result:** POST returns matched+duelId -> direct to matched state -> navigate. Verified by test "goes directly to matched when POST returns matched with duelId".

### F-3: Cancel Search -- PASS
**Method:** Code trace + automated test
**Result:** Cancel -> stopPolling -> DELETE (best-effort) -> idle. Verified by test "stops polling and sends DELETE on cancel".

### F-4: Timeout -- PASS
**Method:** Code trace + automated test
**Result:** Poll returns expired/idle -> timeout state -> "No opponent found" with retry/back. Verified by two timeout tests.

### F-5: Error Recovery -- PASS
**Method:** Code trace + automated test
**Result:** Network/429/500 -> error state -> message + retry/back. Verified by four error-path tests.

### F-6: Already In Queue (409) -- PASS
**Method:** Code trace + automated test
**Result:** POST 409 -> searching -> resume polling -> match. Verified by test "resumes polling when POST returns 409".

## Negative/Boundary Cases

| Case | Test | Result |
|------|------|--------|
| matched without duelId (poll) | Automated | Stays searching (test line 782) |
| matched without duelId (POST) | Automated | Falls to searching (test line 811) |
| Cancel from idle | Automated | No DELETE sent (test line 466) |
| Unmount when idle | Automated | No DELETE sent (test line 516) |
| Unmount after match | Automated | No DELETE sent (test line 530) |
| Poll network error | Automated | Swallowed, retries next tick (test line 651) |
| Poll 500 | Automated | Ignored, keeps polling (test line 695) |
| POST JSON parse failure | Automated | Fallback error message (test line 724) |
| Continued polling on "waiting" | Automated | Keeps polling until matched (test line 606) |
| POST returns expired | Automated | Direct to timeout (test line 378) |

## Exploratory Pass

| Scenario | Result |
|----------|--------|
| Double-submit | Overlay covers HomeScreen, preventing re-tap on QuickPlayCard |
| Navigate away mid-search | Unmount cleanup fires: interval cleared, DELETE sent |
| Empty state | QuickPlayCard renders normally in idle; no broken state |
| Refresh mid-flow | Component re-mounts idle; old queue entry expires server-side (300s TTL) |

## Informational Notes

1. **Brief empty overlay on match:** When status transitions to "matched", queueActive (status !== "idle") is true, so SearchingOverlay renders momentarily with no inner content (no branch for "matched"). The useEffect navigate fires immediately, unmounting the component. Not visible to the user but could be eliminated by gating overlay on `status !== "matched"` as well.

2. **Spec structural format:** Flows F-1 through F-6 do not carry `critical: yes|no` annotations. The spec is functionally complete (all flows have matching ACs, stories cover paths, recovery documented) but does not use the structured field format from the QA gate checklist. Noted for future spec authoring.
