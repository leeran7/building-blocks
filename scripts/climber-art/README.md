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
