# Badger gameplay artwork: generation prompts

These prompts produce the Badger's climb sprites in the same pipeline as the
Wraith (`git show 7406c15:output/wraith/README.md` and
`output/wraith/movement/README.md` in that commit). Until the finished sheets
land, the game draws the Badger as a tinted Wraith placeholder (accent `#be4df4`).

## Deliverables and contract

Match the Wraith files and `app/public/climb/README.md`, so the engine needs
only a registry entry:

| File | Layout | Source cell | Shipped as |
| --- | --- | --- | --- |
| `badger-poses.png` | 4 × 2 cells, row-major | 512 × 512 | `app/public/climb/badger-poses-192.png` (768 × 384) |
| `badger-climb.png` | 6 × 1 cells, left to right | 512 × 512 | `app/public/climb/badger-climb-192.png` (1152 × 192) |

- Poses order: **Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down**.
- Every frame shares the foot anchor `(256, 460)` of its 512 cell, and the idle
  figure's visible height is **380 px**. Do not fit frames to their opaque
  bounds: the crouch stays shorter, the jump stays taller.
- All poses face three-quarter right; the climb strip is the back view. No
  frame is mirrored (the engine mirrors for left-facing movement).
- Straight-alpha RGBA with true zero-alpha background, at least 52 px of empty
  margin to each cell edge, no ground shadow, text, border or scene.
- Downscale each 512 cell to 192 with a high-quality filter, then palette
  quantise (the two Wraith sheets together are ~70 KB).

## Identity reference

Use `app/mobile/src/assets/avatars/badger.webp` as the identity reference.
Keep the white head stripe and black eye masks, the round ears, the stocky build and the violet chevron recognisable at 30 CSS px tall. Match the Wraith's proportions
(oversized head, short chunky limbs, ~2.2 heads tall), matte charcoal armour,
soft studio lighting and low-poly facets, so the cast reads as one set.

## Sheet prompt (poses)

One 4 × 2 sheet of a chibi low-poly badger brawler: a big wedge-shaped head with small round ears, a bold white stripe from the nose over the crown flanked by black eye masks, a dark nose, two glowing violet eyes, a stocky barrel torso and short thick limbs with heavy charcoal armour plates, violet `#be4df4` facet accents on the shoulder pads, forearms, knees and a chest chevron, and small blunt claws on the gloves. Fixed three-quarter right-facing view.
Ordered poses: idle, running with one stride, opposite running stride,
right-arm overhead reach, left-arm overhead reach, falling with limbs spread,
both-arm celebration, crouched down. Constant character scale, generous
separation, no text, scene, border, or ground shadow. Pure flat magenta
(`#ff00ff`) intermediate background for local alpha extraction. Accent facets
are graded toward `#be4df4` (violet).

## Run B correction prompt

The same right-facing Badger, with the near leg bent backward and boot kicked
behind to image left, the far leg forward toward image right, the near arm
swinging forward across the chest and the far arm behind. Preserve the head,
face angle, costume, proportions, and lighting. A single centered sprite on the
same flat magenta extraction background, with no shadow or text.

## Movement reference prompt (for the climb strip)

Create two full-body orthographic views of the exact Badger from the poses sheet,
side by side at the same size and foot baseline. Left: strict right-facing side
profile, one visible glowing eye, visible arm extended forward horizontally for
rigging, other arm hidden. Right: centered symmetric back view, face hidden,
arms down and out in an A pose and legs separated; the white stripe runs from the crown down the back of the head, grizzled grey-black fur plates across the shoulders, a short stubby tail. Preserve the
proportions, matte charcoal armour, `#be4df4` facet accents and
consistent soft studio lighting. No weapons, labels, scene, borders, or ground
shadows. Use a flat magenta intermediate background for local alpha extraction.

## Climb strip

Rig the back view (cut overlapping armour segments, rotate at the joints,
two-segment IK for arms and legs) rather than regenerating each frame, so the
costume stays stable. Six frames, 125 ms each, 750 ms loop: right-hand reach
with left-foot lift, pull, transfer, then the same with sides swapped. Keep the
head and torso centred with under 2 px of vertical bob and no lateral drift;
the engine supplies the upward movement.

## Registering the art

Drop the two 192 files into `app/public/climb/`, then in
`app/src/components/Game/climberCharacters.ts` replace the `badger: tint(...)`
entry with `badger: sheets("badger")`.

## Checks before shipping

- Sheet sizes, RGBA, alpha range 0–255, transparent corners and gutters.
- Common baseline of 460 in every poses cell; Run A ≠ Run B and Reach A ≠
  Reach B image data.
- No magenta fringe on light and dark backgrounds.
- Preview over the volcano texture at 48, 80 and 144 px idle height.
