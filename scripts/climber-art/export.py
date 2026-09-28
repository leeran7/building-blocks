"""Render the characters into app/public/climb/ as palette-quantised PNGs.

    python3 scripts/climber-art/export.py            # every character
    python3 scripts/climber-art/export.py lynx heron # some
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from characters import ALL  # noqa: E402
from rig import render  # noqa: E402

DEST = os.path.join(os.path.dirname(__file__), "..", "..", "app", "public", "climb")


def quantise(im: Image.Image) -> Image.Image:
    return im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)


if __name__ == "__main__":
    want = set(sys.argv[1:])
    for ch in ALL:
        if want and ch.id not in want:
            continue
        poses, climb = render(ch)
        for name, im in (("poses", poses), ("climb", climb)):
            path = os.path.join(DEST, f"{ch.id}-{name}-192.png")
            quantise(im).save(path, optimize=True)
            print(path, os.path.getsize(path), "bytes")
