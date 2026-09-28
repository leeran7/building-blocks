# Otter climber art

Generation brief for the Otter climb sprite, matching the Wraith pipeline
(`git show 7406c15:output/wraith/README.md`). The identity reference is the
avatar portrait `app/mobile/src/assets/avatars/otter.webp`. Until this art
lands, the game draws Otter as the Wraith tinted blue (`#3595f2`), set in
`app/src/components/Game/climberCharacters.ts`.

## Deliverables

| File | Layout | Source cell |
| --- | --- | --- |
| `otter-poses.png` | 4 × 2 cells, 2048 × 1024 | 512 × 512 |
| `otter-climb.png` | 6 × 1 cells, 3072 × 512 | 512 × 512 |

Both are straight-alpha RGBA PNGs with real zero-alpha backgrounds and
untrimmed cells. The shipped files are these downscaled to 192px cells and
palette-quantised, like `app/public/climb/wraith-*-192.png`
(`otter-poses-192.png` at 768 × 384, `otter-climb-192.png` at 1152 × 192).

Every frame keeps the Wraith contract so the engine needs no per-character
tuning:

- Foot anchor at `(256, 460)` of each 512 cell; the feet of every grounded
  pose rest on y = 460.
- Idle visible height is 380px, head to sole. One scale for every pose: the
  crouch stays shorter, nothing is fitted to its own bounding box.
- At least 30px of empty gutter to every cell edge, including tail and ears.
- Poses face three-quarter right. No frame is mirrored; the engine mirrors
  for left-facing movement.
- Accent facets graded toward `#3595f2`.

Pose sheet order, left to right then top to bottom: **Idle, Run A, Run B,
Reach A, Reach B, Falling, Celebrate, Down**. The climb strip is six
back-view frames: right-hand reach with left-foot lift, pull, transfer, then
the same with sides swapped. Its body stays centred with under 2px of bob.

## Prompts

Sheet prompt: one 4 × 2 sheet of the same character, a chibi low-poly otter warrior: big round head with small rounded ears, a cream `#d8cdbd` faceted muzzle with thin white whiskers, glowing blue eyes, matte charcoal faceted fur and armor, bright blue `#3595f2` facet accents on the brow, shoulders, forearms and a blue chest chevron, short chunky limbs with webbed paws, and a thick tapered tail. Big head,
short chunky limbs, the same proportions as a chibi figure about two and a
half heads tall. Fixed three-quarter right-facing view. The thick tail trails behind at the hip and stays attached in every pose. Ordered poses:
idle, running with one stride, opposite running stride, right-arm overhead
reach, left-arm overhead reach, falling with limbs spread, both-arm
celebration, crouched down. Constant character scale, generous separation,
no text, scene, border, or ground shadow. Pure flat magenta intermediate
background for local alpha extraction.

Run B correction prompt: the same right-facing character, with the near leg
bent backward and foot kicked behind to image left, the far leg forward
toward image right, the near arm swinging forward across the chest and the
far arm behind. Preserve head angle, face, costume, proportions and
lighting. A single centred sprite on the same flat magenta extraction
background, with no shadow or text.

Reference views prompt (for the climb strip): two full-body orthographic
views of the exact Otter from the pose sheet, side by side at the same size
and foot baseline. Left: strict right-facing side profile, one visible
blue eye, visible arm extended forward horizontally for rigging. Right:
centred symmetric back view, the back of the head shows both ears and no face or whiskers; the tail hangs down between the legs, arms down and out in an A pose and legs
separated. Preserve the costume, proportions, `#3595f2` facet accents and
soft studio lighting. No weapons, labels, scene, borders or ground shadows.
Flat magenta intermediate background.

Climb strip: rig the back view (fixed parts, joint rotations, two-segment
IK for arms and legs) rather than regenerating each frame, so the costume
stays stable across the loop. Omit the duplicate closing frame.

## Notes

Whiskers are thin; at 192px they must still read. Give them a soft 2px light line rather than 1px hairlines, or drop them from the back view.

## Checks before shipping

- Dimensions, real alpha 0–255, and transparent corners and gutters.
- Common 460 baseline for grounded poses; Run A ≠ Run B and Reach A ≠
  Reach B pixel data.
- No magenta fringe on light and dark backgrounds.
- Preview over the volcano tile at 48, 80 and 144px idle height.
- Swap the `tint(...)` entry in
  `app/src/components/Game/climberCharacters.ts` for `sheets("otter")` and
  add the files to `app/public/climb/` (see `app/public/climb/README.md`).
