# Falcon climber artwork

Status: **code-drawn art in game**. The shipped `falcon-poses-192.png` and
`falcon-climb-192.png` are rendered by the low-poly rig in
`tools/climber-art/batch-2/` (`python3 tools/climber-art/batch-2/build.py falcon`),
and the registry entry is `falcon: sheets("falcon")` in
`app/src/components/Game/climberCharacters.ts`. The prompts below are for
replacing them with generated art later: overwrite the two files, same names.
The full contract is `app/public/climb/README.md`.

Identity reference: `app/mobile/src/assets/avatars/falcon.webp`. Palette sampled
from it: burnt orange `#d9893d` / `#a25d32` feathers, charcoal `#3b2e2c` /
`#171212` plumage, cream `#e8dcc4` face mask, gold `#edc36c` beak and chest plate,
glowing amber `#ff9a2a` eye.

## Delivery contract (same as the Wraith)

- `falcon-poses.png`: 2048 × 1024 straight-alpha RGBA, two rows of four untrimmed
  512 × 512 cells, left to right then top to bottom: **Idle, Run A, Run B,
  Reach A, Reach B, Falling, Celebrate, Down**. Every pose faces three-quarter
  right; no frame is mirrored.
- `falcon-climb.png`: 3072 × 512, six 512 × 512 back-view climb frames. Right
  hand reach pairs with left foot lift, then pull and transfer; the second half
  swaps sides. Hood/head and torso stay centred, under 2 px body bob.
- Foot root at `(256, 460)` in every cell; idle figure 380 px tall. One scale for
  every pose, never fit each frame to its opaque bounds (the Down crouch must
  stay shorter). At least 52 px empty margin to each cell edge.
- Ship at 192 px (foot anchor (96, 172.5), idle height 142.5): downscale each
  512 cell to 192 (Lanczos), palette-quantise to under ~50 KB per file, save
  as `falcon-poses-192.png` (768 × 384) and `falcon-climb-192.png` (1152 × 192).

## Sheet prompt

One 4 × 2 sprite sheet of the same chibi low-poly falcon warrior, big head and
short chunky limbs, faceted burnt-orange and charcoal feather armour, cream face
mask around a glowing amber eye, short hooked gold beak, layered orange feather
pauldrons, gold chevron chest plate, charcoal talon boots, small folded wings
on the back that read as a feather cape. Fixed three-quarter right-facing view.
Ordered poses: idle, running with one stride, opposite running stride,
right-arm overhead reach, left-arm overhead reach, falling with limbs and wing
feathers spread, both-arm celebration, crouched down. Constant character scale,
generous separation, no text, scene, border, or ground shadow. Pure flat magenta
intermediate background for local alpha extraction.

## Run B correction prompt

The same right-facing falcon, with the near leg bent backward and talon boot
kicked behind to image left, the far leg forward toward image right, the near
arm swinging forward across the chest and the far arm behind. Preserve beak,
eye, face mask, feather armour, proportions and lighting. A single centred
sprite on the same flat magenta extraction background, no shadow or text.

## Climb reference prompt

Two full-body orthographic views of the exact same chibi falcon, side by side at
the same size and foot baseline. Left: strict right-facing side profile, one
visible amber eye, visible arm extended forward horizontally for rigging, other
arm hidden. Right: centred symmetric back view, the back of the feathered head
hiding the face and beak, folded wing-cape centred, arms down and out in an A
pose, legs separated. Preserve the orange/charcoal faceted feathers, gold
chevron, pauldrons and talon boots, consistent soft studio lighting. No weapons,
labels, scene, borders, or ground shadows. Flat magenta intermediate background.
Animate the back view into the six climb frames with joint rotations (do not
regenerate each frame) so the costume stays stable.
