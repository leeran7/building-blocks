# Design critique

How to evaluate UX quality beyond the checklist. Read after `SKILL.md` for
nuanced review.

## Accessibility beyond compliance

- Screen reader flow: does the DOM order match the visual reading order?
- Focus management: after a modal closes, focus returns to the trigger.
- Color is never the only indicator (add icons, text, or patterns).
- Error messages name the field and the fix, not just "invalid input."

## States audit

Every screen and interactive component must handle:

| State | What to show |
|-------|-------------|
| Loading | Skeleton matching the content shape, not a spinner |
| Empty | Why it's empty + primary action to fill it |
| Error | What failed + how to recover + retry action |
| Success | Confirmation + what happens next |
| First use | Guided entry point, not a blank canvas |
| Partial | Meaningful content even before everything loads |

## UX writing

- Labels describe the outcome, not the mechanism ("Save changes" not "Submit").
- Error messages are specific and actionable ("Email must include @" not
  "Invalid field").
- Empty states guide, not apologize ("Add your first project" not "Nothing
  here yet").
- Confirmation messages confirm what happened ("Project saved" not "Success").

## Product thinking

- Does the flow start where the user already is?
- Can the user recover from every error without starting over?
- Does the success state lead somewhere useful, or is it a dead end?
- Would a new user understand this without seeing the old version?
