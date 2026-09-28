# Raven climber art

Generation brief for the Raven climb sprite, matching the Wraith pipeline
(`git show 7406c15:output/wraith/README.md`). The identity reference is the
avatar portrait `app/mobile/src/assets/avatars/raven.webp`. The shipped
sheets (`app/public/climb/raven-poses-192.png` and `raven-climb-192.png`) are
drawn in code by `tools/climber-art/render.py`, a low-poly rig that follows
this contract. Generated art from the prompts below can replace them: drop
in the new files, since the registry entry is already `sheets("raven")`.

## Deliverables

| File | Layout | Source cell |
| --- | --- | --- |
| `raven-poses.png` | 4 × 2 cells, 2048 × 1024 | 512 × 512 |
| `raven-climb.png` | 6 × 1 cells, 3072 × 512 | 512 × 512 |

Both are straight-alpha RGBA PNGs with real zero-alpha backgrounds and
untrimmed cells. The shipped files are these downscaled to 192px cells and
palette-quantised, like `app/public/climb/wraith-*-192.png`
(`raven-poses-192.png` at 768 × 384, `raven-climb-192.png` at 1152 × 192).

Every frame keeps the Wraith contract so the engine needs no per-character
tuning:

- Foot anchor at `(256, 460)` of each 512 cell; the feet of every grounded
  pose rest on y = 460.
- Idle visible height is 380px, head to sole. One scale for every pose: the
  crouch stays shorter, nothing is fitted to its own bounding box.
- At least 30px of empty gutter to every cell edge, including tail and ears.
- Poses face three-quarter right. No frame is mirrored; the engine mirrors
  for left-facing movement.
- Accent facets graded toward `#f4b943`.

Pose sheet order, left to right then top to bottom: **Idle, Run A, Run B,
Reach A, Reach B, Falling, Celebrate, Down**. The climb strip is six
back-view frames: right-hand reach with left-foot lift, pull, transfer, then
the same with sides swapped. Its body stays centred with under 2px of bob.

## Prompts

Sheet prompt: one 4 × 2 sheet of the same character, a chibi low-poly raven warrior: big bird head with a swept-back crest of faceted feathers, a short hooked amber `#f4b943` beak, a pale grey face patch, glowing amber eyes, matte charcoal-black faceted feathers and armor, amber `#f4b943` facet accents on the crest, pauldrons, wing edges and an amber chest chevron. Arms are feathered wing-arms that end in gloved hands (so it can grip a ladder), short chunky legs with taloned boots, and a short fanned tail. Big head,
short chunky limbs, the same proportions as a chibi figure about two and a
half heads tall. Fixed three-quarter right-facing view. The short fanned tail sits low behind the hips; the feathered wing-arm edges trail slightly behind each arm. Ordered poses:
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
views of the exact Raven from the pose sheet, side by side at the same size
and foot baseline. Left: strict right-facing side profile, one visible
amber eye, visible arm extended forward horizontally for rigging. Right:
centred symmetric back view, the back of the head shows the crest and no beak or eyes; the wing-arm feathers fan behind each arm and the tail fans below the waist, arms down and out in an A pose and legs
separated. Preserve the costume, proportions, `#f4b943` facet accents and
soft studio lighting. No weapons, labels, scene, borders or ground shadows.
Flat magenta intermediate background.

Climb strip: rig the back view (fixed parts, joint rotations, two-segment
IK for arms and legs) rather than regenerating each frame, so the costume
stays stable across the loop. Omit the duplicate closing frame.

## Notes

The raven must climb, so the hands are gloved fingers, not wing tips. Keep the beak short; a long beak breaks the chibi silhouette and changes the facing read.

## Checks before shipping

- Dimensions, real alpha 0–255, and transparent corners and gutters.
- Common 460 baseline for grounded poses; Run A ≠ Run B and Reach A ≠
  Reach B pixel data.
- No magenta fringe on light and dark backgrounds.
- Preview over the volcano tile at 48, 80 and 144px idle height.
- Replace the files in `app/public/climb/` (see `app/public/climb/README.md`).
  The registry already reads `sheets("raven")`.
