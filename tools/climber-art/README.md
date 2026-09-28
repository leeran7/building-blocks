# Climber art renderer

Draws climber sprite sheets in code: a low-poly chibi rig (two-bone IK
limbs, faceted parts, glowing eyes) posed into the eight-cell poses atlas
and the six-frame back-view climb strip described in
`app/public/climb/README.md`.

    python3 -m pip install pillow numpy scipy
    python3 tools/climber-art/render.py            # writes app/public/climb/<id>-*-192.png

| File | What |
|--|--|
| `lowpoly.py` | facet triangulation, shading, rendering, packing |
| `rig.py` | shared body: torso, arms, legs, feet, front and back views |
| `characters.py` | Panther, Otter and Raven heads, tails and wings; the poses and climb cycle |
| `render.py` | renders, scales each idle figure to 380 px, checks gutters, writes sheets |

Facets are cut once per part in the part's own space, so they do not shimmer
between frames. Each character is scaled about the foot anchor so its idle
figure is exactly 380 px tall in the 512 pack cell, as the contract asks.
