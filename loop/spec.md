# Spec: 1v1 Quick Play on Mobile

**Product:** The Climb (building-blocks)
**Goal ID:** mobile-quick-play
**Status:** draft
**Date:** 2026-09-19

## Goal

Port the web random matchmaking queue flow to the mobile Capacitor SPA so
players can find a random opponent and race them in a 1v1 duel, using the
existing `/api/duel/queue` backend and the existing `DuelRoomScreen`.

## Scope

### In scope

- QuickPlayCard on HomeScreen (new ModeCard row)
- Queue state management hook (join, poll, cancel, timeout, error)
- Searching overlay (full-screen modal with spinner, status text, cancel)
- Navigation to `/duel/:id` on match
- Haptic feedback on join, cancel, match found

### Out of scope

- Paid/chip duel features (excluded per mobile/README.md)
- Backend changes (queue API already exists and works)
- Tournament mode
- W/L stats display on mobile home
- Challenge a friend via in-app search (separate feature)
- Sound effects

### Assumptions

- The user is signed in (non-anonymous) -- the app is auth-gated
- Category is hardcoded to "tech" (same as web and challenge card)
- Queue TTL is 300s server-side; client treats "expired" as timeout

### Constraints

- No `any` types -- `unknown` + narrowing
- Auth effects gate on `loading`
- Structured `{ error, code }` at HTTP boundaries
- Match existing ModeCard / apiFetch / haptics patterns exactly

## Flows

### F-1: Join Queue (Happy Path)

1. Player taps "Quick Play" ModeCard on HomeScreen
2. Searching overlay appears with spinner + "Searching for opponent..."
3. POST to `/api/duel/queue` with `{ categorySlug: "tech" }`
4. If response is `{ status: "waiting" }`, begin polling GET every ~2s
5. On poll response `{ status: "matched", duelId }`, navigate to `/duel/:id`
6. DuelRoomScreen takes over the full duel lifecycle

### F-2: Instant Match

1. Player taps "Quick Play"
2. POST returns `{ status: "matched", duelId }` immediately
3. Navigate to `/duel/:id` -- no polling needed

### F-3: Cancel Search

1. Player is in searching overlay
2. Player taps "Cancel"
3. DELETE to `/api/duel/queue` (best-effort)
4. Overlay dismisses, player returns to HomeScreen

### F-4: Timeout

1. Player is searching, poll returns `{ status: "expired" }`
2. Overlay shows "No opponent found" with "Search again" and "Back" buttons
3. Player can retry (back to F-1) or dismiss (back to HomeScreen)

### F-5: Error Recovery

1. POST to join queue fails (network, 429, 500)
2. Overlay shows error message with "Try again" button
3. Player can retry or dismiss

### F-6: Already In Queue (409)

1. Player taps Quick Play while already holding a queue slot
2. POST returns 409 ALREADY_QUEUED
3. Resume polling (the prior slot is still alive)

## Personas

### P-1: Casual Climber (Alex)

Plays 2-3 sessions per day. Wants a quick competitive hit without coordinating
with a specific friend. Taps Quick Play, waits, races, done.

### P-2: Returning Player (Jordan)

Comes back after app was backgrounded mid-search. Expects the search state to
resolve cleanly (timeout or match) without getting stuck.

## Stories

### S-1 (P-1, F-1, F-2): Quick Match

As Alex, I want to tap one button and get matched with a random opponent, so I
can start a 1v1 race without sharing a link or waiting for a friend.

- Happy: Tap Quick Play -> searching -> matched -> race starts
- Failure: Network down -> error message -> retry

### S-2 (P-1, F-3): Cancel Search

As Alex, I want to cancel my search at any time, so I am not locked in if I
change my mind.

- Happy: Tap Cancel -> overlay dismisses, returns to home
- Failure: DELETE fails -> UI still dismisses (best-effort cancel)

### S-3 (P-2, F-4): Timeout Recovery

As Jordan, I want to be told when no opponent was found, so I can choose to
search again or do something else instead of staring at a spinner forever.

- Happy: Timeout -> "No opponent found" -> tap "Search again"
- Failure: Already covered by error states

## Acceptance Criteria

### AC-1: Quick Play card visible on HomeScreen

Given the player is signed in and on HomeScreen,
When the screen renders,
Then a "Quick Play" ModeCard is visible between the Daily Climb and Challenge
cards, with a bolt icon, "signal" tint, and subtitle "Find a random opponent".

### AC-2: Tapping Quick Play joins the queue

Given the player taps Quick Play,
When the POST to `/api/duel/queue` succeeds with `{ status: "waiting" }`,
Then a full-screen searching overlay appears with a spinner, "Searching for
opponent..." text, and a Cancel button.

### AC-3: Polling finds a match

Given the player is in the searching state,
When a GET poll returns `{ status: "matched", duelId: "abc123" }`,
Then the app navigates to `/duel/abc123` and the searching overlay is dismissed.

### AC-4: Cancel leaves queue

Given the player is searching,
When the player taps Cancel,
Then a DELETE is sent to `/api/duel/queue` (best-effort), the overlay dismisses,
and the player sees the HomeScreen.

### AC-5: Timeout shows retry

Given the player is searching,
When a GET poll returns `{ status: "expired" }`,
Then the overlay shows "No opponent found" with a "Search again" button and a
"Back" button to dismiss.

### AC-6: Errors show actionable message

Given a POST/GET fails with a network error or non-2xx status,
Then an error message is shown in the overlay with a "Try again" button.

### AC-7: Haptic feedback on actions

Given haptics are enabled,
When the player taps Quick Play (tapMedium), a match is found (notifySuccess),
or they cancel (tapLight), appropriate haptic feedback fires.

### AC-8: 409 resumes polling

Given the player is already in the queue,
When POST returns 409 ALREADY_QUEUED,
Then the app resumes polling GET without showing an error.

## NFRs

| ID | Requirement | Measure |
|----|-------------|---------|
| NFR-1 | Poll interval | ~2000ms (matches web) |
| NFR-2 | Overlay response | Appears within 100ms of tap (perceived instant) |
| NFR-3 | No leaked intervals | All polling stops on unmount |
| NFR-4 | Touch targets | >= 44px per DESIGN.md and a11y skill |
| NFR-5 | Queue cleanup | DELETE on component unmount if still searching (best-effort) |

## Risks

1. **Queue TTL mismatch** -- server TTL is 300s. If the client does not handle
   "expired", the user sees a spinner forever. Mitigated by AC-5.
2. **Race condition on navigate** -- match found while user taps cancel. The
   interval is cleared synchronously on cancel. Acceptable: cancel means cancel.

## Open Questions

None -- the backend API is stable and the web flow is the reference.

## Future

- Show estimated wait time
- Animate the searching overlay with the game backdrop
- Sound effect on match found
- Quick Play from duel result screen ("Play again" -> re-queue)
