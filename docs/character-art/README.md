# Climber art prompts

One file per unlockable character, for producing its gameplay sprites the same
way the Wraith's were made (built-in image generation, then local processing).
Until a character's sheets land in `app/public/climb/`, the game draws it as a
tinted Wraith placeholder from the registry in
`app/src/components/Game/climberSprite.ts`.

Every character follows the Wraith contract (`app/public/climb/README.md`):

- **Poses sheet** `<id>-poses-192.png`: 4 × 2 cells, read left to right, top to
  bottom: Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down.
  Fixed three-quarter right-facing view; no frame mirrored.
- **Climb strip** `<id>-climb-192.png`: 6 cells, back view. Right-hand reach
  with left-foot lift, pull, transfer; the second half swaps sides.
- Generate at 512 × 512 cells, foot anchor `(256, 460)`, idle visible height
  380 px, constant scale across every pose (the crouch stays shorter). Then
  downscale to 192 px cells and palette-quantise, as the Wraith sheets were.
- Identity reference: `app/mobile/src/assets/avatars/<id>.webp` (head and
  shoulders only, so the prompt describes the body).
- Flat magenta intermediate background for local alpha extraction; remove
  magenta fringe; straight-alpha RGBA PNG with real zero-alpha background.

Shared style line for every prompt: chibi low-poly faceted warrior, oversized
head, short chunky limbs, matte charcoal armor, glowing eyes, soft studio
lighting, no text, scene, border, weapons or ground shadow.
