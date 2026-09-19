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

## Microinteractions

Obsess over: button press, pull-to-refresh, successful completion, copy, save,
favorite, share, errors, undo, loading, navigation, keyboard. These details
create perceived quality.

## UX writing

Short, human, specific, calm, helpful, confident. No corporate jargon, generic
filler, technical language, passive voice, or unnecessary explanations.

Buttons describe the action — not "Continue" but "Create account". Errors
explain: what happened, why (when useful), what the user can do next.

## User flow patterns

- **Entry**: every flow has a discoverable entry point — button, link, or nav.
- **Empty state**: first-time users see explanation + primary action, not blank.
- **Error recovery**: show what went wrong, why, and how to fix. Include retry.
- **Success next step**: after completion, tell the user what happened and what's next.
- **Loading transitions**: skeleton screens for layout, spinners for actions,
  progress bars for uploads.
