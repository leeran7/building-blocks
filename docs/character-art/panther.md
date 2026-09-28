# Panther climber art

Generation brief for the Panther climb sprite, matching the Wraith pipeline
(`git show 7406c15:output/wraith/README.md`). The identity reference is the
avatar portrait `app/mobile/src/assets/avatars/panther.webp`. Until this art
lands, the game draws Panther as the Wraith tinted violet (`#b446f4`), set in
`app/src/components/Game/climberCharacters.ts`.

## Deliverables

| File | Layout | Source cell |
| --- | --- | --- |
| `panther-poses.png` | 4 × 2 cells, 2048 × 1024 | 512 × 512 |
| `panther-climb.png` | 6 × 1 cells, 3072 × 512 | 512 × 512 |

Both are straight-alpha RGBA PNGs with real zero-alpha backgrounds and
untrimmed cells. The shipped files are these downscaled to 192px cells and
palette-quantised, like `app/public/climb/wraith-*-192.png`
(`panther-poses-192.png` at 768 × 384, `panther-climb-192.png` at 1152 × 192).

Every frame keeps the Wraith contract so the engine needs no per-character
tuning:

- Foot anchor at `(256, 460)` of each 512 cell; the feet of every grounded
  pose rest on y = 460.
- Idle visible height is 380px, head to sole. One scale for every pose: the
  crouch stays shorter, nothing is fitted to its own bounding box.
- At least 30px of empty gutter to every cell edge, including tail and ears.
- Poses face three-quarter right. No frame is mirrored; the engine mirrors
  for left-facing movement.
- Accent facets graded toward `#b446f4`.

Pose sheet order, left to right then top to bottom: **Idle, Run A, Run B,
Reach A, Reach B, Falling, Celebrate, Down**. The climb strip is six
back-view frames: right-hand reach with left-foot lift, pull, transfer, then
the same with sides swapped. Its body stays centred with under 2px of bob.

## Prompts

Sheet prompt: one 4 × 2 sheet of the same character, a chibi low-poly black panther warrior: big feline head with short rounded ears, a pale grey faceted muzzle and chin, glowing violet eyes, matte charcoal-black faceted fur and armor, violet `#b446f4` facet accents on the brow, ears, pauldrons and a violet chest chevron, short chunky limbs with padded paws, and a long low-poly tail. Big head,
short chunky limbs, the same proportions as a chibi figure about two and a
half heads tall. Fixed three-quarter right-facing view. The tail curls up behind the body and must stay attached at the hip in every pose. Ordered poses:
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
views of the exact Panther from the pose sheet, side by side at the same size
and foot baseline. Left: strict right-facing side profile, one visible
violet eye, visible arm extended forward horizontally for rigging. Right:
centred symmetric back view, the back of the head shows both ears and no face; the tail hangs straight down between the legs, arms down and out in an A pose and legs
separated. Preserve the costume, proportions, `#b446f4` facet accents and
soft studio lighting. No weapons, labels, scene, borders or ground shadows.
Flat magenta intermediate background.

Climb strip: rig the back view (fixed parts, joint rotations, two-segment
IK for arms and legs) rather than regenerating each frame, so the costume
stays stable across the loop. Omit the duplicate closing frame.

## Notes

Keep the tail inside the cell with the 30px gutter; it is the part most likely to clip in the run and falling poses.

## Checks before shipping

- Dimensions, real alpha 0–255, and transparent corners and gutters.
- Common 460 baseline for grounded poses; Run A ≠ Run B and Reach A ≠
  Reach B pixel data.
- No magenta fringe on light and dark backgrounds.
- Preview over the volcano tile at 48, 80 and 144px idle height.
- Swap the `tint(...)` entry in
  `app/src/components/Game/climberCharacters.ts` for `sheets("panther")` and
  add the files to `app/public/climb/` (see `app/public/climb/README.md`).
