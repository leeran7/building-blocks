# Climber art rig

Draws climber sheets in code: a low-poly chibi rig rendered to the contract
in `app/public/climb/README.md` (4 × 2 poses atlas plus a 6-frame back-view
climb strip, 192 px cells, foot anchor and idle height matching the Wraith).

```sh
python3 -m pip install pillow
python3 scripts/climber-art/export.py            # every character here
python3 scripts/climber-art/export.py lynx       # one
```

`export.py` overwrites `app/public/climb/<id>-poses-192.png` and
`<id>-climb-192.png`, palette-quantised.

- `rig.py`: skeleton (two-bone IK limbs), faceted shading, outline and eye
  glow, the eight poses and the climb cycle. Coordinates are the art pack's
  512 px cell, rendered 3× and downscaled.
- `characters.py`: each character's palette, proportions, head, tail and
  optional torso, pauldron and boot drawers.

To add a character, define it in `characters.py`, add it to `ALL`, export,
then switch its registry entry to `sheets("<id>")`.

Kestrel, Mantis and Yak are drawn by their own rig in
[`kestrel-mantis-yak/`](kestrel-mantis-yak/README.md) (built in parallel with
this one); run `python3 scripts/climber-art/kestrel-mantis-yak/build.py kestrel mantis yak`.

## Generated paid character compilation

`process_paid.py` uses the renderer's existing Pillow/numpy dependencies. It
never modifies source masters or registers art automatically:

```sh
python3 scripts/climber-art/process_paid.py kestrel --check-only --report /tmp/paid-art.json
python3 scripts/climber-art/process_paid.py kestrel --output-root /tmp/paid-preview
python3 scripts/climber-art/process_paid.py --all --report /tmp/paid-art-all.json
python3 -m unittest discover -s scripts/climber-art -p 'test_process_paid.py'
```

Inputs beneath `paid-characters/art/<id>-void/`:

- `<id>-void-poses.png`: 4x2 square-cell atlas (2:1 image aspect).
- `<id>-void-climb-grid.png`: preferred 3x2 square-cell grid (3:2 aspect),
  read row-major and packed into the runtime 6x1 strip.
- Alternatively `<id>-void-climb.png`: 6x1 square-cell strip (6:1 aspect).

The grid file wins when both climb formats exist. Any resolution is accepted
if the regular cell grid is square (0.5% aspect tolerance); fractional master
boundaries such as 1774x887 are resized as one grid. Wide rectangular climb
cells are rejected rather than squeezed. The artist must maintain identical
body scale/framing between pose and climb masters; no per-pose resizing occurs.

Green backgrounds are expected for Lynx, Panther, Wolf and Badger, magenta
for others; `--key` explicitly overrides. Near-key pixels are removed with
soft alpha edges and key-color unmixing; far colors remain unchanged before
resampling. Existing real-alpha sheets retain alpha. Check all colors against
the portrait afterward: no color-key algorithm can distinguish a garment
whose color matches its backdrop. A bad border/key choice fails explicitly.

Standing poses (idle, both runs, both reaches, celebrate and down/crouch; indices0,1,2,3,4,6,7) receive vertical translations to sole row172, limited to24px (`--max-ground-shift` can reduce this limit). Airborne falling index5 retains its authored position. A single climb-sheet Y shift aligns its lowest sole to172 and preserves
relative frame motion. A shared uniform scale about(96,172.5) fits both sheets
inside11px gutters; all standing-pose translations and the climb shift are fused with that scale to prevent intermediate clipping of raised hands. Source-cell edge checks still run before any translation.
The crouch retains its relative height and all14 cells keep one shared scale.
After that, each cycle is stabilised so the engine's crossfades move limbs
rather than the whole figure: both run strides are scaled about the anchor to
the idle's visible height (0.85 to 1.2; not its mass, which a spread stride
covers less of, so matching it blew the figure up every other step) and their
head column is moved onto the idle's, then re-grounded; a stride whose
palette drifted from the idle's (mean hue of the saturated pixels off by 3 to
15 degrees, which pulsed the panther's tint once a step) is rotated back
(`hueShift` in the report). The climb strip is
first re-sequenced into the smoothest loop: every kept frame is used, as
drawn or mirrored (a rear-view hand-over-hand is symmetric, so a mirrored
frame is the other hand's reach), no image twice, in the order with the
smallest silhouette change between consecutive frames, the first kept frame
staying first. A loop with a hand-over-hand rhythm wins over any smoother
one without it: the high hand (the side the top of the silhouette leans to)
holds one side for a run of frames, then the other, as the Wraith's does,
because the smoothest ordering of a bag of poses keeps the same hand high
throughout and reads as a one-armed shimmy. The report's `cycle` lists the
order (`4m` = frame 4 mirrored), `highSide` per frame, `handOverHand`, and
the per-step pixel change before and after. Then climb frames
2 to 6 are scaled to frame 1's mass (0.9 to 1.1) and translated onto its body
(the cross-correlation peak of the blurred alpha, up to 24px), and the strip
is grounded as a whole. The report's `stabilised` lists each move. Generated
climb grids are otherwise a bag of poses in no order, drifting 5 to 25px
between renders, which ghosted and jolted every Void climb loop.

A character whose loop needs a hand can carry `cycle.json` next to its
masters, `paid-characters/art/<id>-void/cycle.json`:

```json
{"climb": {"mirror": false, "exclude": [3], "order": ["1", "2m", "4", "5", "6", "3"]}}
```

`mirror: false` keeps every frame as drawn (for a tail or marking that swaps
sides when mirrored); `exclude` drops frames whose pose does not belong in the
loop, their slots filled by mirrors of the others; `order` fixes the loop
outright. Any other key, or an order that repeats a frame, fails the
character. The report's `cycle.overrides` echoes what applied.

`smoothness.py` measures the result the way a player sees it: it replays the
engine's cycle maths (distance-driven frames, the per-character crossfade
window from `climberCharacters.ts`) at 60 Hz and reports the largest change
between two displayed frames, with the Wraith as the reference. `--strip`
writes the displayed frames side by side. The Void climb strips dissolve
continuously in the engine (`cycleBlend.climb` 0.5): six re-sequenced poses
cut 14 times a second flicker, dissolved they read as limbs moving, and every
Void climb then changes less per displayed frame than the Wraith's does.
Factors below0.65 or shifts over24px fail. Empty frames, clipped
edges, wrong aspect, and climb pairs with <=1000 visibly different pixels
fail the character without writing either output. JSON reports record the shared factor, whole-sheet shifts, individual grounding
translations, bounding boxes, gutters and climb difference minimum.
This validates geometry only: visually review anatomy, colors, pose order,
scale, key spill and climbing direction, measure skull `headTop`, and only
then add the runtime registry entry. All18 characters are required for the
full correction; a partial batch is reported as incomplete with exit1.
