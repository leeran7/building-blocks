# Falcon, Marmot and Gecko renderer

Draws the three characters' climber sheets in code: a chibi rig (two-bone
limbs, faceted parts with a dark rim, glowing eyes) posed into the eight-cell
poses atlas and the six-frame back-view climb strip described in
`app/public/climb/README.md`.

    python3 -m pip install pillow
    python3 tools/climber-art/batch-2/build.py falcon marmot gecko
    python3 tools/climber-art/batch-2/build.py falcon --preview /tmp   # + a preview over the volcano tile

| File | What |
|--|--|
| `rig.py` | skeleton, poses, climb cycle, faceted shading, outline, packing |
| `body.py` | shared torso, arms, legs, hands, feet, pauldrons |
| `falcon.py`, `marmot.py`, `gecko.py` | palette, head, tail / wings, limb colours |
| `build.py` | writes `<id>-poses-192.png` and `<id>-climb-192.png` |

Each figure is scaled about the foot anchor (256, 460) so its idle figure is
exactly 380 px tall in the 512 pack cell; the feet sit on the anchor in every
grounded pose. Output is deterministic (fixed seeds), so a rebuild with no code
change reproduces the same bytes.
