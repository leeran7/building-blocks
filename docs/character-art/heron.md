# Heron gameplay artwork: generation prompts

Unlocks at 300 stars. The shipped sheets are drawn in code by the low-poly rig in
`scripts/climber-art/` (`heron: sheets("heron")` in
`app/src/components/Game/climberCharacters.ts`; accent `#3b93e6`). These prompts are
for replacing them with generated art later.

Produce the art in the Wraith pipeline (`git show 7406c15:output/wraith/README.md`
and `output/wraith/movement/README.md` in that commit) and ship it to the
contract in `app/public/climb/README.md`: `heron-poses-192.png` (4 × 2 cells:
Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down) and
`heron-climb-192.png` (6-frame back-view climb). Generate at 512 × 512 cells with
the foot anchor at `(256, 460)` and a 380 px idle height, one scale for every
pose, then downscale to 192 px cells and palette-quantise. Identity reference:
`app/mobile/src/assets/avatars/heron.webp` (head and shoulders only, so the
prompts describe the body). Shared style: chibi low-poly faceted warrior,
oversized head, short chunky limbs, matte charcoal armor, glowing eyes, soft
studio lighting, no text, scene, border, weapons or ground shadow.

Identity (from `heron.webp`): low-poly heron head with white and pale-grey
facets, a black stripe running from the eye down the back of the neck, a long
pointed golden beak (`#e8a92a`), swept-back cobalt crest plumes (`#1050b0`
through `#3b93e6`), a glowing blue eye, and layered blue, grey and charcoal
feather pauldrons.

## Poses sheet prompt

One 4 × 2 sheet of the same chibi low-poly heron warrior: oversized white and
grey heron head with a long golden beak pointing right, a black eye stripe,
glowing blue eye, swept-back cobalt crest plumes, a short neck, slim torso in
matte charcoal armor with cobalt `#3b93e6` facet accents and a blue chevron on
the chest, layered blue-and-grey feather pauldrons, short limbs, slender grey
legs ending in armored bird-foot boots. Fixed three-quarter right-facing view.
Ordered poses: idle (standing tall, beak level), running with one stride,
opposite running stride, right-arm overhead reach, left-arm overhead reach,
falling with limbs spread and feathers flared, both-arm celebration with the
beak raised, crouched down with the neck tucked. Constant character scale; the
beak tip must stay inside the cell with at least 40 px margin in every pose.
Generous separation, no text, scene, border, or ground shadow. Pure flat
magenta intermediate background for local alpha extraction.

Run B correction (if Run B repeats Run A): the same right-facing heron, near leg
bent backward with the boot kicked behind to image left, far leg forward toward
image right, near arm swinging forward across the chest, far arm behind.
Preserve beak, crest, face angle, costume, proportions and lighting. Single
centred sprite on the same flat magenta background, no shadow or text.

## Movement reference prompt

Two full-body orthographic views of the exact same chibi heron warrior, side
by side at the same size and foot baseline. Left: strict right-facing side
profile, beak level, visible arm extended forward horizontally for rigging.
Right: centred symmetric back view, crest plumes fanning up and back, the black
neck stripe down the centre, beak hidden behind the head, arms down and out in
an A pose, legs apart, a short fan of tail feathers. Preserve the head,
charcoal armor, cobalt facets and a matching back chevron. Flat magenta
background.

## Climb strip notes

Back view only. The crest plumes trail a few pixels behind each pull; the tail
fan stays centred. Under 2 px body bob.
