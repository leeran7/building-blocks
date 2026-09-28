# Lynx gameplay artwork: generation prompts

Unlocks at 200 stars. Until the finished sheets land, the game draws the
Lynx as the plain Wraith (`lynx: base()` in
`app/src/components/Game/climberCharacters.ts`; its sampled accent `#f23db5` is kept
in `RECOLOR_PALETTE` for a future recolour feature).

Produce the art in the Wraith pipeline (`git show 7406c15:output/wraith/README.md`
and `output/wraith/movement/README.md` in that commit) and ship it to the
contract in `app/public/climb/README.md`: `lynx-poses-192.png` (4 × 2 cells:
Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down) and
`lynx-climb-192.png` (6-frame back-view climb). Generate at 512 × 512 cells with
the foot anchor at `(256, 460)` and a 380 px idle height, one scale for every
pose, then downscale to 192 px cells and palette-quantise. Identity reference:
`app/mobile/src/assets/avatars/lynx.webp` (head and shoulders only, so the
prompts describe the body). Shared style: chibi low-poly faceted warrior,
oversized head, short chunky limbs, matte charcoal armor, glowing eyes, soft
studio lighting, no text, scene, border, weapons or ground shadow.

Identity (from `lynx.webp`): low-poly lynx head, charcoal and slate-grey fur
facets, hot-magenta accent facets (`#f23db5`, shading to `#b01070`), tall
pointed ears with black tufts, spiky cheek ruff flaring out and back, glowing
magenta eyes, small pink nose, white whisker lines, magenta-trimmed armored
collar and pauldrons.

## Poses sheet prompt

One 4 × 2 sheet of the same chibi low-poly lynx warrior: oversized lynx head
with tufted ears and a spiky magenta-and-grey cheek ruff, glowing magenta eyes,
short chunky limbs, matte charcoal armor with hot-magenta `#f23db5` facet
accents, a magenta chevron on the chest, faceted pauldrons, clawed gloves and
padded boots, a short tufted tail behind. Fixed three-quarter right-facing view.
Ordered poses: idle, running with one stride, opposite running stride,
right-arm overhead reach, left-arm overhead reach, falling with limbs spread,
both-arm celebration, crouched down on all fours like a pouncing cat. Constant
character scale, generous separation, no text, scene, border, or ground shadow.
Pure flat magenta-free intermediate background: use flat **green** `#00ff00`
here, since magenta is the character's accent colour.

Run B correction (if Run B repeats Run A): the same right-facing lynx, near leg
bent backward with the boot kicked behind to image left, far leg forward toward
image right, near arm swinging forward across the chest, far arm behind.
Preserve ears, ruff, face angle, costume, proportions and lighting. Single
centred sprite on the same flat background, no shadow or text.

## Movement reference prompt

Two full-body orthographic views of the exact same chibi lynx warrior, side by
side at the same size and foot baseline. Left: strict right-facing side profile,
one visible magenta eye, visible arm extended forward horizontally for rigging.
Right: centred symmetric back view, ears and ruff visible from behind, the
tufted tail hanging down the centre, arms down and out in an A pose, legs
apart. Preserve the head, ruff, charcoal armor, magenta `#f23db5` facets and
chevron (a matching chevron on the back plate). Flat `#00ff00` background.

## Climb strip notes

Back view only; the face never shows. Ears and ruff stay fixed on the head; the
tail sways a few pixels opposite the lifted foot. Less than 2 px body bob.
