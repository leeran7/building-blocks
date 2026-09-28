# Mantis climber art — generation brief

Placeholder until this art exists: the climb view draws a tinted Wraith for
Mantis (accent `#88e321`). This brief is for producing the real
sheets so they can replace it with no code change beyond the registry's
sprite paths. Reference identity: `app/mobile/src/assets/avatars/mantis.webp`
(head-and-shoulders portrait only, so the body below is new design).

## Deliverables

Match the Wraith pipeline exactly (see `git show 7406c15:output/wraith/README.md`
and `output/wraith/movement/README.md` in the same commit).

| File | Layout | Content |
| --- | --- | --- |
| `mantis-poses.png` | 2048 × 1024 RGBA, 4 × 2 cells of 512 × 512 | Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down (row-major) |
| `mantis-climb.png` | 3072 × 512 RGBA, 6 cells of 512 × 512 | Back-view ladder climb loop |

Shipped versions are the same sheets downscaled to 192 px cells and palette
quantised: `app/public/climb/mantis-poses-192.png` (768 × 384) and
`app/public/climb/mantis-climb-192.png` (1152 × 192).

Contract, identical to the Wraith so the engine needs no per-character tuning:

- Every pose faces three-quarter right; nothing is mirrored (the engine mirrors).
- Foot anchor `(256, 460)` in every 512 cell; all poses share one scale, set
  by the idle figure's ~380 px visible height. Do not fit each pose to its
  bounds: the Down crouch stays shorter.
- Real zero-alpha background, no ground shadow, text, border or scene, and at
  least 52 px of empty margin to every cell edge.
- Accent facets graded toward `#88e321` (lime), which is
  also the placeholder tint, so the swap reads as the same character.
- Chibi proportions like the Wraith: head about 40% of the figure height,
  short chunky limbs, matte low-poly faceting with soft studio light.

## Prompts

Use the image-generation tool with `mantis.webp` attached as the identity reference.

**Poses sheet.** One 4 × 2 sheet of the same character: a chibi low-poly insect warrior with a big triangular mantis head, two large faceted glowing green `#d8f84a` compound eyes, and two long thin swept-back lime antennae; bright lime `#88e321` and leaf-green `#469330` angular carapace plates over charcoal `#1b1d26` armor, a pointed V collar on the chest, short chunky legs with segmented green shin plates and dark boots, and short arms whose forearms are folded raptorial blades with a serrated inner edge (no hands visible when folded; blade tips act as fists).
Fixed three-quarter right-facing view. Ordered poses: idle, running with one
stride, opposite running stride, right-arm overhead reach, left-arm overhead
reach, falling with limbs spread, both-arm celebration, crouched down.
Constant character scale, generous separation, no text, scene, border or
ground shadow. Pure flat magenta intermediate background for local alpha
extraction. Preserve the triangular head, twin glowing compound eyes, antennae, raptorial blade forearms and lime/green carapace in every pose.

**Run B correction** (if Run B comes back as a copy of Run A). The same
right-facing character, with the near leg bent backward and boot kicked behind
to image left, the far leg forward toward image right, the near arm swinging
forward across the chest and the far arm behind. Preserve the triangular head, twin glowing compound eyes, antennae, raptorial blade forearms and lime/green carapace,
face angle, proportions and lighting. A single centered sprite on the same
flat magenta background, with no shadow or text.

**Back-view reference** (for the climb strip). A centered, symmetric,
full-body orthographic back view of the exact same character at the idle
pose's size and foot baseline, arms down and out in an A pose and legs
separated for rigging; the antennae must stay inside the cell (curve them back and down, at least 52 px from the top edge); the head reads as a smooth green wedge with no face. No labels, scene, border or ground shadow;
flat magenta background.

**Climb strip.** Six frames from the back view, animated with joint rotations
on the reference (not regenerated per frame) so the costume stays stable:
right-hand reach paired with left-foot lift, then pull and transfer; the second
half swaps sides. Hood/head and torso stay centered with under 2 px of body
bob and no lateral drift; the engine supplies the upward movement.
On the climb the blade forearms hook over the rungs instead of gripping; the antennae stay fixed to the head.

## Post-processing and checks

1. Remove the magenta background, correct edge colors, and remove magenta
   fringe (check on light and dark backgrounds).
2. Normalise every frame to the `(256, 460)` foot anchor at the common scale.
3. Confirm Run A ≠ Run B and Reach A ≠ Reach B as image data.
4. Downscale to 192 px cells (Lanczos) and palette-quantise; aim for under
   ~80 KB for both files together, like the Wraith's ~70 KB.
5. Preview over `app/public/climb/volcano-tile.jpg` at in-game size (~30 CSS px).
