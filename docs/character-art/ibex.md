# Ibex climber artwork (to generate)

Status: **not generated yet.** Until the sheets below exist, the game draws
Ibex as the Wraith sprite tinted gold (`#e8b43a`), set in
the climber sprite registry. The real art replaces that placeholder with no
code change beyond pointing the registry entry at the new files.

Identity reference: `app/mobile/src/assets/avatars/ibex.webp` (the profile
portrait). Attach it to every prompt below. Style must match the shipped
Wraith sheets in `app/public/climb/`: same chibi proportions (big head, short
chunky limbs), same matte low-poly facets and soft studio lighting.

## Deliverables

| File | Layout | Cells |
| --- | --- | --- |
| `app/public/climb/ibex-poses-192.png` | 4 × 2, 768 × 384 | Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down |
| `app/public/climb/ibex-climb-192.png` | 6 × 1, 1152 × 192 | back-view climb cycle |

Generate at 512 px cells first (2048 × 1024 poses, 3072 × 512 climb), then
downscale each sheet by 0.375 with a high-quality filter and palette-quantise
to 256 colours, like the Wraith sheets. Keep the 512 masters out of the repo.

## Integration contract (same as Wraith)

- 512 × 512 cells, never trimmed, real zero-alpha background.
- Foot anchor `(256, 460)` in every cell; the idle figure's visible height is
  380 px. Choose one scale from idle and keep it for every pose, so the
  crouch stays shorter. Never fit a frame to its opaque bounds.
- Every poses cell faces three-quarter right. No frame is mirrored; the
  engine mirrors for left-facing movement.
- At least 40 px of empty margin between the figure and each cell edge.
- The horns curve backward, so in the three-quarter-right poses they sweep toward image left. Keep their tips inside the cell with at least 40 px of margin.

## Prompts

**Poses sheet.** One 4 × 2 sheet of a chibi low-poly mountain ibex warrior standing upright, black-furred goat head with a pale muzzle and glowing amber eye, two long ridged gold horns curving back over the head, charcoal and gold `#e8b43a` faceted armor on the shoulders and chest with a gold chest chevron, hooved boots. Fixed three-quarter
right-facing view. Ordered poses: idle, running with one stride, opposite
running stride, right-arm overhead reach, left-arm overhead reach, falling
with limbs spread, both-arm celebration, crouched down. Constant character
scale, generous separation, no text, scene, border, weapons or ground
shadow. Preserve the long ridged gold horns curving back, the pale muzzle and the amber eye in every pose. Pure flat magenta intermediate
background for local alpha extraction.

**Run B correction** (if Run B repeats Run A). The same right-facing
character, with the near leg bent backward and boot kicked behind to image
left, the far leg forward toward image right, the near arm swinging forward
across the chest and the far arm behind. Preserve the long ridged gold horns curving back, the pale muzzle and the amber eye, face angle,
costume, proportions and lighting. A single centered sprite on the same flat
magenta background, no shadow or text.

**Back-view reference** (for the climb strip). A centered symmetric back
view of the exact same chibi Ibex, the backs of both ridged horns arching over the head, ears visible, no face, arms down and out in
an A pose, legs separated, same size and foot baseline as the poses sheet.
No labels, scene, border or ground shadow; flat magenta background.

**Climb strip.** From the back view, 6 frames left to right in 512 px cells:
right-hand reach with left-foot lift, pull, transfer, then the same with sides
swapped. Hood/helm and torso stay centred with under 2 px of vertical bob and
no sideways drift; hands and feet move relative to a fixed foot anchor.
Animate the reference with joint rotations rather than regenerating each
frame, so the costume stays identical across frames.

## Checks before committing

- Sheet sizes exactly 768 × 384 and 1152 × 192; corners fully transparent.
- Run A ≠ Run B and Reach A ≠ Reach B (different image data, opposite limbs).
- No magenta fringe on light or dark backgrounds.
- Every figure's feet sit on y = 460 × 0.375 = 172.5 in its 192 px cell.
