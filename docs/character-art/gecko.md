# Gecko climber artwork

Status: **code-drawn art in game**. The shipped `gecko-poses-192.png` and
`gecko-climb-192.png` are rendered by the low-poly rig in
`tools/climber-art/batch-2/` (`python3 tools/climber-art/batch-2/build.py gecko`),
and the registry entry is `gecko: sheets("gecko")` in
`app/src/components/Game/climberCharacters.ts`. The prompts below are for
replacing them with generated art later: overwrite the two files, same names.
The full contract is `app/public/climb/README.md`.

Identity reference: `app/mobile/src/assets/avatars/gecko.webp`. Palette sampled
from it: charcoal `#42423d` / `#0f100e` scales, olive `#63714a` / `#26301c`
shading, lime `#cdee4d` and leaf green `#7fc91c` stripes and scale plates,
huge emerald `#3bdc2a` eyes with black slit pupils.

Keep it clearly apart from the Wraith (also charcoal and lime): the Gecko's
green is the deeper leaf green `#7fc91c` in stripes, it has no hood, and its
silhouette is a wide lizard head with bulging eyes and a long tail.

## Delivery contract (same as the Wraith)

- `gecko-poses.png`: 2048 × 1024 straight-alpha RGBA, two rows of four untrimmed
  512 × 512 cells, left to right then top to bottom: **Idle, Run A, Run B,
  Reach A, Reach B, Falling, Celebrate, Down**. Every pose faces three-quarter
  right; no frame is mirrored.
- `gecko-climb.png`: 3072 × 512, six 512 × 512 back-view climb frames. Right
  hand reach pairs with left foot lift, then pull and transfer; the second half
  swaps sides. Head and torso stay centred, under 2 px body bob; the tail may
  sway a few pixels.
- Foot root at `(256, 460)` in every cell; idle figure 380 px tall (tail tip
  excluded if it trails lower). One scale for every pose, never fit each frame
  to its opaque bounds (the Down crouch must stay shorter). At least 52 px empty
  margin to each cell edge.
- Ship at 192 px (foot anchor (96, 172.5), idle height 142.5): downscale each
  512 cell to 192 (Lanczos), palette-quantise to under ~50 KB per file, save
  as `gecko-poses-192.png` (768 × 384) and `gecko-climb-192.png` (1152 × 192).

## Sheet prompt

One 4 × 2 sprite sheet of the same chibi low-poly gecko scout, big wide lizard
head and short chunky limbs, faceted charcoal scales with lime and leaf-green
stripes, huge glowing emerald eyes with slit pupils, wide flat snout, spiky lime
scale pauldrons, lime chevron chest plate, splayed sticky toe pads on hands and
feet, a long striped tail curling behind. Fixed three-quarter right-facing view.
Ordered poses: idle, running with one stride, opposite running stride,
right-arm overhead reach, left-arm overhead reach, falling with limbs and tail
spread, both-arm celebration, crouched down low. Constant character scale,
generous separation, no text, scene, border, or ground shadow. Pure flat magenta
intermediate background for local alpha extraction.

## Run B correction prompt

The same right-facing gecko, with the near leg bent backward and foot kicked
behind to image left, the far leg forward toward image right, the near arm
swinging forward across the chest and the far arm behind, tail swinging the
opposite way to the near leg. Preserve eyes, snout, stripes, pauldrons,
proportions and lighting. A single centred sprite on the same flat magenta
extraction background, no shadow or text.

## Climb reference prompt

Two full-body orthographic views of the exact same chibi gecko, side by side at
the same size and foot baseline. Left: strict right-facing side profile, one
visible emerald eye, visible arm extended forward horizontally for rigging,
other arm hidden. Right: centred symmetric back view, the back of the head and
the tops of the bulging eyes showing, striped spine and tail centred and hanging
down, arms down and out in an A pose, legs separated with splayed toe pads.
Preserve the charcoal/lime faceted scales, pauldrons and chevron, consistent
soft studio lighting. No weapons, labels, scene, borders, or ground shadows.
Flat magenta intermediate background. Animate the back view into the six climb
frames with joint rotations (do not regenerate each frame) so the costume stays
stable.
