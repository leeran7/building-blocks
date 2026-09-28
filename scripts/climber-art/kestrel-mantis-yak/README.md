# Code-drawn climber art

Renders climber sprite sheets from rigged low-poly figures, for characters
that have no generated art. One module per character (`kestrel.py`,
`mantis.py`, `yak.py`) sets its palette, proportions and parts; `climber.py`
holds the shared skeleton and the eight poses; `rig.py` does the faceted
rendering and the fit to the sheet contract in `app/public/climb/README.md`
(foot anchor at (256, 460) of a 512 cell, 380 px idle height, 192 px cells).

```sh
python3 -m pip install pillow
python3 scripts/climber-art/kestrel-mantis-yak/build.py kestrel mantis yak
```

This writes `<id>-poses-192.png` (4×2: idle, run-a, run-b, reach-a, reach-b,
falling, celebrate, down) and `<id>-climb-192.png` (6-frame back-view climb)
into `app/public/climb/`. Poses are joint angles, so the costume is identical
in every frame; the engine adds the bob, lean, squash and crossfades.
