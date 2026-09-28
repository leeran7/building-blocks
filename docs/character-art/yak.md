# Yak climber art — generation brief

Until this art exists the climb view draws Yak as the plain Wraith, set by
its `base()` entry in
`app/src/components/Game/climberCharacters.ts`. When the sheets below exist,
drop them into `app/public/climb/` and change that entry to
`sheets("yak")`; see `app/public/climb/README.md`. Reference identity: `app/mobile/src/assets/avatars/yak.webp`
(head-and-shoulders portrait only, so the body below is new design).

## Deliverables

Match the Wraith pipeline exactly (see `git show 7406c15:output/wraith/README.md`
and `output/wraith/movement/README.md` in the same commit).

| File | Layout | Content |
| --- | --- | --- |
| `yak-poses.png` | 2048 × 1024 RGBA, 4 × 2 cells of 512 × 512 | Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down (row-major) |
| `yak-climb.png` | 3072 × 512 RGBA, 6 cells of 512 × 512 | Back-view ladder climb loop |

Shipped versions are the same sheets downscaled to 192 px cells and palette
quantised: `app/public/climb/yak-poses-192.png` (768 × 384) and
`app/public/climb/yak-climb-192.png` (1152 × 192).

Contract, identical to the Wraith so the engine needs no per-character tuning:

- Every pose faces three-quarter right; nothing is mirrored (the engine mirrors).
- Foot anchor `(256, 460)` in every 512 cell; all poses share one scale, set
  by the idle figure's ~380 px visible height. Do not fit each pose to its
  bounds: the Down crouch stays shorter.
- Real zero-alpha background, no ground shadow, text, border or scene, and at
  least 52 px of empty margin to every cell edge.
- Accent facets graded toward `#ea4239` (crimson), the colour sampled
  from the portrait (kept in `RECOLOR_PALETTE`).
- Chibi proportions like the Wraith: head about 40% of the figure height,
  short chunky limbs, matte low-poly faceting with soft studio light.

## Prompts

Use the image-generation tool with `yak.webp` attached as the identity reference.

**Poses sheet.** One 4 × 2 sheet of the same character: a chibi low-poly yak warrior with a big bovine head, dark charcoal `#372f2e` muzzle and face, two glowing orange-red eyes, two wide curved tan `#d5a687` horns faceted like bone, and a shaggy mane of angular crimson `#ea4239` / dark red `#7d0e0e` fur shards covering the head and shoulders; broad charcoal `#140c0b` armor torso with crimson fur plates on the chest and shoulders, short thick arms with heavy dark gauntlets, short thick legs with crimson fur at the shins and hoof-shaped dark boots.
Fixed three-quarter right-facing view. Ordered poses: idle, running with one
stride, opposite running stride, right-arm overhead reach, left-arm overhead
reach, falling with limbs spread, both-arm celebration, crouched down.
Constant character scale, generous separation, no text, scene, border or
ground shadow. Pure flat magenta intermediate background for local alpha
extraction. Preserve the wide tan horns, glowing orange eyes, dark muzzle and crimson shaggy mane in every pose.

**Run B correction** (if Run B comes back as a copy of Run A). The same
right-facing character, with the near leg bent backward and boot kicked behind
to image left, the far leg forward toward image right, the near arm swinging
forward across the chest and the far arm behind. Preserve the wide tan horns, glowing orange eyes, dark muzzle and crimson shaggy mane,
face angle, proportions and lighting. A single centered sprite on the same
flat magenta background, with no shadow or text.

**Back-view reference** (for the climb strip). A centered, symmetric,
full-body orthographic back view of the exact same character at the idle
pose's size and foot baseline, arms down and out in an A pose and legs
separated for rigging; the horns set the silhouette from behind; keep both horn tips at least 52 px inside the cell edges. No labels, scene, border or ground shadow;
flat magenta background.

**Climb strip.** Six frames from the back view, animated with joint rotations
on the reference (not regenerated per frame) so the costume stays stable:
right-hand reach paired with left-foot lift, then pull and transfer; the second
half swaps sides. Hood/head and torso stay centered with under 2 px of body
bob and no lateral drift; the engine supplies the upward movement.
Yak is the heaviest character: keep the torso steady and give the pull a slightly slower, planted feel through the pose shapes rather than extra bob.

## Post-processing and checks

1. Remove the magenta background, correct edge colors, and remove magenta
   fringe (check on light and dark backgrounds).
2. Normalise every frame to the `(256, 460)` foot anchor at the common scale.
3. Confirm Run A ≠ Run B and Reach A ≠ Reach B as image data.
4. Downscale to 192 px cells (Lanczos) and palette-quantise; keep each
   shipped file under ~50 KB (`app/public/climb/README.md`).
5. Preview over `app/public/climb/volcano-tile.jpg` at in-game size (~30 CSS px).
