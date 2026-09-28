# Wolf gameplay artwork: generation prompts

These prompts produce the Wolf's climb sprites in the same pipeline as the
Wraith (`git show 7406c15:output/wraith/README.md` and
`output/wraith/movement/README.md` in that commit). The Wolf
currently ships code-drawn sheets (`app/public/climb/wolf-poses-192.png` and
`wolf-climb-192.png`), rendered by a low-poly rig that follows this contract:
facets seeded per part so they hold still across frames, accent `#f43fba`,
glowing eyes and a dark silhouette outline. Generated art made with these
prompts can replace those two files directly; the registry line stays
`wolf: sheets("wolf")`.

## Deliverables and contract

Match the Wraith files and `app/public/climb/README.md`, so the engine needs
only a registry entry:

| File | Layout | Source cell | Shipped as |
| --- | --- | --- | --- |
| `wolf-poses.png` | 4 × 2 cells, row-major | 512 × 512 | `app/public/climb/wolf-poses-192.png` (768 × 384) |
| `wolf-climb.png` | 6 × 1 cells, left to right | 512 × 512 | `app/public/climb/wolf-climb-192.png` (1152 × 192) |

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

Use `app/mobile/src/assets/avatars/wolf.webp` as the identity reference.
Keep the tall ears, the shard-like ruff, the grey muzzle, the magenta chevron and the bushy tail recognisable at 30 CSS px tall. Match the Wraith's proportions
(oversized head, short chunky limbs, ~2.2 heads tall), matte charcoal armour,
soft studio lighting and low-poly facets, so the cast reads as one set.

## Sheet prompt (poses)

One 4 × 2 sheet of a chibi low-poly wolf warrior: a big angular head with tall pointed ears, a jagged shaggy ruff of shard-like fur around the neck and shoulders, a grey muzzle with a dark nose, two glowing magenta eyes, charcoal armour on the torso, forearms and boots with hot-magenta `#f43fba` facet accents on the ruff, shoulder pads and a chest chevron, and a bushy faceted tail. Fixed three-quarter right-facing view.
Ordered poses: idle, running with one stride, opposite running stride,
right-arm overhead reach, left-arm overhead reach, falling with limbs spread,
both-arm celebration, crouched down. Constant character scale, generous
separation, no text, scene, border, or ground shadow. Pure flat magenta
(`#ff00ff`) intermediate background for local alpha extraction. Accent facets
are graded toward `#f43fba` (hot magenta).

## Run B correction prompt

The same right-facing Wolf, with the near leg bent backward and boot kicked
behind to image left, the far leg forward toward image right, the near arm
swinging forward across the chest and the far arm behind. Preserve the head,
face angle, costume, proportions, and lighting. A single centered sprite on the
same flat magenta extraction background, with no shadow or text.

## Movement reference prompt (for the climb strip)

Create two full-body orthographic views of the exact Wolf from the poses sheet,
side by side at the same size and foot baseline. Left: strict right-facing side
profile, one visible glowing eye, visible arm extended forward horizontally for
rigging, other arm hidden. Right: centered symmetric back view, face hidden,
arms down and out in an A pose and legs separated; tall ears and the back of the shaggy ruff frame the head, the bushy tail hangs between the legs. Preserve the
proportions, matte charcoal armour, `#f43fba` facet accents and
consistent soft studio lighting. No weapons, labels, scene, borders, or ground
shadows. Use a flat magenta intermediate background for local alpha extraction.

## Climb strip

Rig the back view (cut overlapping armour segments, rotate at the joints,
two-segment IK for arms and legs) rather than regenerating each frame, so the
costume stays stable. Six frames, 125 ms each, 750 ms loop: right-hand reach
with left-foot lift, pull, transfer, then the same with sides swapped. Keep the
head and torso centred with under 2 px of vertical bob and no lateral drift;
the engine supplies the upward movement.

## Checks before shipping

- Sheet sizes, RGBA, alpha range 0–255, transparent corners and gutters.
- Common baseline of 460 in every poses cell; Run A ≠ Run B and Reach A ≠
  Reach B image data.
- No magenta fringe on light and dark backgrounds.
- Preview over the volcano texture at 48, 80 and 144 px idle height.
