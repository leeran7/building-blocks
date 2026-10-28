# UX patterns & interaction design

Parent: `context/ux.md`. Read that file first for principles and component states.

## Interaction design

Every interaction needs feedback: press, loading, success, error, empty,
progress, navigation. Interactions feel immediate. When an operation takes time,
communicate what is happening — never leave users wondering "Did that work?"

## Motion design

Motion communicates cause-and-effect, spatial relationships, state changes,
hierarchy, continuity — not decoration.

Prefer: subtle transitions, natural easing, context-preserving movement,
gesture-linked motion, meaningful feedback.

Avoid: excessive bouncing, long animations, distracting transitions, animation
that delays the user.

Respect `prefers-reduced-motion`.

### Motion styles in this app

Style names and what they mean: `skills/design-review/motion-styles.md`. In
the mobile app (`app/mobile/`) they map to:

| Style | Here |
|-------|------|
| Durations, easings, springs | `lib/motionTokens.ts` (`duration`, `ease`, `spring`); CSS reads `--motion-*` in `styles.css` |
| Route transitions (push, pop, tab, hero, launch/land zoom) | `RouteTransition` (`TransitionKind`), sliding by `travel`, zooming by `zoom` |
| In-screen page swap | `PageSwap`; Ranks' board uses `useSlideSwap` |
| Shared element / hero | `sharedId` layoutIds inside RouteTransition's `LayoutGroup`; add hero routes to `HERO_MOVES` |
| Sheets | `SheetPortal`, wrapped in `<AnimatePresence>` at the call site |
| Stagger / rise-in | `riseIn` variants with `staggerDelay` (capped by `STAGGER_CAP`) |
| Press | `press` (`whileTap` scale on `spring.bouncy`) |
| Sticky | Tailwind `sticky` (e.g. the pinned CTA footer in `LevelStartSheet`) |
| Pull to refresh | `PullToRefresh` |
| Reduced motion | `MotionConfig reducedMotion="user"` in `App`; JS loops check `prefersReducedMotion()` |

Screens scroll inside `ScreenBody`'s `overflow-y-auto`, not the window, so
scroll-linked styles pass that element as `useScroll({ container })` and
scroll-triggered ones as `viewport={{ root }}`. Game-canvas motion under
`app/src/game/` is simulation, not UI motion: see `skills/sim-change/`.

## Microinteractions

Obsess over: button press, pull-to-refresh, successful completion, copy, save,
favorite, share, errors, undo, loading, navigation, keyboard. These details
create perceived quality.

## UX writing

Short, human, specific, calm, helpful, confident. No corporate jargon, generic
filler, technical language, passive voice, or unnecessary explanations.

Buttons describe the action — not "Continue" but "Create account". Errors
explain: what happened, why (when useful), what the user can do next.

Glossary (one word, one meaning, on the web and in the app):

| Say | Not | Meaning |
|---|---|---|
| Doomstack | Stack | The game and the company name in copy |
| Level | stage, floor | A tower on the level map |
| Tier | level, rank (for XP) | The XP ladder (`XP_TIER` in `mobile/src/lib/levels/terms.ts`) |
| Endless | Free climb, Solo | The solo mode on a fresh endless tower, with one all-time leaderboard (Leeran, 2026-10-28) |
| Daily Climb | Daily challenge | The one tower everyone gets each UTC day ("Daily" on a short tab) |
| 1v1 | versus match | A head-to-head race (Versus is the app's entry sheet) |
| Try again | Retry, Reload | The button on a failed load |
| Coming soon | sign in to enter | A mode that is announced but switched off on the server |

A page for a state (not found, coming soon, sign in first, failed to load)
uses `StatusPage` on the web: site header, an h1 that names the state, one
sentence on what to do, and a link onward.

## User flow patterns

- **Entry**: every flow has a discoverable entry point — button, link, or nav.
- **Empty state**: first-time users see explanation + primary action, not blank.
- **Error recovery**: show what went wrong, why, and how to fix. Include retry.
- **Success next step**: after completion, tell the user what happened and what's next.
- **Loading transitions**: skeleton screens for layout, spinners for actions,
  progress bars for uploads.
