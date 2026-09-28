# Marmot climber artwork

Status: **no art yet**. The registry
(`app/src/components/Game/climberCharacters.ts`) draws the Marmot as the plain
Wraith (`base()` entry); its sampled colours ("#eaae74", "#2d1f18") are kept in
`RECOLOR_PALETTE` for a future recolour feature. To ship real art, generate the two
sheets below, drop `marmot-poses-192.png` and `marmot-climb-192.png` into
`app/public/climb/`, and change that entry to `sheets("marmot")`. The full
contract is `app/public/climb/README.md`.

Identity reference: `app/mobile/src/assets/avatars/marmot.webp`. Palette sampled
from it: copper `#d0925c` / `#8a5d40` faceted fur, dark brown `#58331e`,
charcoal `#342924` / `#151110` armour, cream `#f1c389` muzzle and belly, black
nose, glowing amber `#ffb03a` eyes.

## Delivery contract (same as the Wraith)

- `marmot-poses.png`: 2048 × 1024 straight-alpha RGBA, two rows of four untrimmed
  512 × 512 cells, left to right then top to bottom: **Idle, Run A, Run B,
  Reach A, Reach B, Falling, Celebrate, Down**. Every pose faces three-quarter
  right; no frame is mirrored.
- `marmot-climb.png`: 3072 × 512, six 512 × 512 back-view climb frames. Right
  hand reach pairs with left foot lift, then pull and transfer; the second half
  swaps sides. Head and torso stay centred, under 2 px body bob.
- Foot root at `(256, 460)` in every cell; idle figure 380 px tall. One scale for
  every pose, never fit each frame to its opaque bounds (the Down crouch must
  stay shorter). At least 52 px empty margin to each cell edge.
- Ship at 192 px (foot anchor (96, 172.5), idle height 142.5): downscale each
  512 cell to 192 (Lanczos), palette-quantise to under ~50 KB per file, save
  as `marmot-poses-192.png` (768 × 384) and `marmot-climb-192.png` (1152 × 192).

## Sheet prompt

One 4 × 2 sprite sheet of the same chibi low-poly marmot brawler, big round head
and short chunky limbs, stocky barrel body, faceted copper and dark-brown fur,
charcoal plate armour, cream muzzle with a small black nose and a stern brow,
glowing amber eyes, small round ears, heavy copper shoulder pads, copper chevron
chest plate, short bushy tail. Fixed three-quarter right-facing view. Ordered
poses: idle, running with one stride, opposite running stride, right-arm
overhead reach, left-arm overhead reach, falling with limbs spread, both-arm
celebration, crouched down. Constant character scale, generous separation, no
text, scene, border, or ground shadow. Pure flat magenta intermediate background
for local alpha extraction.

## Run B correction prompt

The same right-facing marmot, with the near leg bent backward and foot kicked
behind to image left, the far leg forward toward image right, the near arm
swinging forward across the chest and the far arm behind. Preserve face, ears,
fur facets, armour, tail, proportions and lighting. A single centred sprite on
the same flat magenta extraction background, no shadow or text.

## Climb reference prompt

Two full-body orthographic views of the exact same chibi marmot, side by side at
the same size and foot baseline. Left: strict right-facing side profile, one
visible amber eye, visible arm extended forward horizontally for rigging, other
arm hidden. Right: centred symmetric back view, round ears and the back of the
head hiding all facial features, bushy tail centred, arms down and out in an A
pose, legs separated. Preserve the copper/charcoal faceted fur, shoulder pads
and chevron, consistent soft studio lighting. No weapons, labels, scene,
borders, or ground shadows. Flat magenta intermediate background. Animate the
back view into the six climb frames with joint rotations (do not regenerate
each frame) so the costume stays stable.
