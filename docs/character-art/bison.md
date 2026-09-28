# Bison gameplay artwork: generation prompts

Unlocks at 250 stars. The shipped sheets are drawn in code by the low-poly rig in
`scripts/climber-art/` (`bison: sheets("bison")` in
`app/src/components/Game/climberCharacters.ts`; accent `#f1442a`). These prompts are
for replacing them with generated art later.

Produce the art in the Wraith pipeline (`git show 7406c15:output/wraith/README.md`
and `output/wraith/movement/README.md` in that commit) and ship it to the
contract in `app/public/climb/README.md`: `bison-poses-192.png` (4 × 2 cells:
Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down) and
`bison-climb-192.png` (6-frame back-view climb). Generate at 512 × 512 cells with
the foot anchor at `(256, 460)` and a 380 px idle height, one scale for every
pose, then downscale to 192 px cells and palette-quantise. Identity reference:
`app/mobile/src/assets/avatars/bison.webp` (head and shoulders only, so the
prompts describe the body). Shared style: chibi low-poly faceted warrior,
oversized head, short chunky limbs, matte charcoal armor, glowing eyes, soft
studio lighting, no text, scene, border, weapons or ground shadow.

Identity (from `bison.webp`): low-poly bison head with a charcoal face and
dark muzzle, broad nose, two tan curved horns (`#c9a06a`) sweeping out and up,
glowing red-orange eyes, a huge shaggy mane of red-orange facets (`#f1442a`
through `#901010`) wrapping the head and shoulders, heavy charcoal and red
armored shoulders.

## Poses sheet prompt

One 4 × 2 sheet of the same chibi low-poly bison warrior: oversized bison head
with tan curved horns, charcoal face and dark muzzle, glowing red-orange eyes, a
massive shaggy red-orange faceted mane over the head and a raised shoulder
hump, a stocky barrel torso wider than the Wraith's, short thick limbs, matte
charcoal armor with ember-red `#f1442a` facet accents, a red chevron on the
chest, heavy hoof-like boots and big gauntlets. Fixed three-quarter
right-facing view. Ordered poses: idle (planted, head low), running with one
stride, opposite running stride, right-arm overhead reach, left-arm overhead
reach, falling with limbs spread, both-arm celebration, crouched down head-first
like a charging bull. Constant character scale, generous separation, no text,
scene, border, or ground shadow. Pure flat magenta intermediate background for
local alpha extraction.

Run B correction (if Run B repeats Run A): the same right-facing bison, near leg
bent backward with the boot kicked behind to image left, far leg forward toward
image right, near arm swinging forward across the chest, far arm behind.
Preserve horns, mane, face angle, costume, proportions and lighting. Single
centred sprite on the same flat magenta background, no shadow or text.

## Movement reference prompt

Two full-body orthographic views of the exact same chibi bison warrior, side by
side at the same size and foot baseline. Left: strict right-facing side profile,
one visible eye, horn curving forward, visible arm extended forward
horizontally for rigging. Right: centred symmetric back view, the mane and hump
covering the upper back, both horns showing either side of the head, arms down
and out in an A pose, legs apart, a short tufted tail. Preserve the horns,
mane, charcoal armor, ember-red facets and a matching back chevron. Flat
magenta background.

## Climb strip notes

Back view only. The mane and horns are the silhouette: keep both horn tips
inside the cell's 52 px margin at full reach. The heavier body rises less:
under 2 px bob, hands reach slightly lower than the Wraith's.
