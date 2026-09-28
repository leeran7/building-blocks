"""
Render the Panther, Otter and Raven climber sheets.

    python3 tools/climber-art/render.py [--out app/public/climb] [--preview DIR]

Needs Python 3.10+, pillow, numpy and scipy. Writes <id>-poses-192.png (4×2)
and <id>-climb-192.png (6×1) per character, and prints each sheet's checks.
Every character is scaled about the foot anchor so its idle figure is exactly
380 px tall in the 512 pack cell (142.5 px in the 192 cell).
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))

import grounding  # noqa: E402
from characters import CHARACTERS, CLIMB_FRAMES, POSE_NAMES, POSES  # noqa: E402
from lowpoly import ANCHOR, CELL, OUT, SS, pack, quantize, to_cell  # noqa: E402
from rig import back, front  # noqa: E402

REF_H = 380.0
GUTTER = 30


def top_of(img: Image.Image) -> float:
    a = np.array(img.getchannel("A"))
    rows = np.where(a.max(1) > 40)[0]
    return rows[0] / SS


def scale_about_anchor(img: Image.Image, k: float) -> Image.Image:
    ax, ay = ANCHOR[0] * SS, ANCHOR[1] * SS
    inv = 1 / k
    # output (x,y) samples input (ax + (x-ax)/k, ay + (y-ay)/k)
    coeffs = (inv, 0, ax - ax * inv, 0, inv, ay - ay * inv)
    pm = img.convert("RGBa").transform(img.size, Image.Transform.AFFINE, coeffs, resample=Image.Resampling.BICUBIC)
    return pm.convert("RGBA")


def bounds(img: Image.Image) -> tuple[float, float, float, float]:
    a = np.array(img.getchannel("A"))
    ys, xs = np.where(a > 24)
    s = CELL / img.size[0]
    return xs.min() * s, ys.min() * s, xs.max() * s, ys.max() * s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "app", "public", "climb"))
    ap.add_argument("--preview", default=None)
    ap.add_argument("--only", default=None)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for ch in CHARACTERS:
        if args.only and ch.id != args.only:
            continue
        idle = front(ch, POSES[0]).render()
        k = REF_H / (ANCHOR[1] - top_of(idle))
        big_poses = [scale_about_anchor(front(ch, p).render(), k) for p in POSES]
        big_climb = [scale_about_anchor(back(ch, i / CLIMB_FRAMES).render(), k) for i in range(CLIMB_FRAMES)]
        for name, im in list(zip(POSE_NAMES, big_poses)) + [(f"climb-{i}", im) for i, im in enumerate(big_climb)]:
            x0, y0, x1, y1 = bounds(im)
            if min(x0, y0, CELL - x1, CELL - y1) < GUTTER:
                print(f"  ! {ch.id} {name}: bounds {x0:.0f},{y0:.0f}-{x1:.0f},{y1:.0f} break the {GUTTER}px gutter")
        h = ANCHOR[1] - top_of(big_poses[0])
        # planted feet on the anchor; the falling cell hangs from it instead
        cells = [to_cell(im) if name == "falling" else grounding.snap(to_cell(im)) for name, im in zip(POSE_NAMES, big_poses)]
        poses = quantize(pack(cells, 4))
        climb = quantize(pack([to_cell(im) for im in big_climb], 6))
        pp = os.path.join(args.out, f"{ch.id}-poses-{OUT}.png")
        cp = os.path.join(args.out, f"{ch.id}-climb-{OUT}.png")
        poses.save(pp, optimize=True)
        climb.save(cp, optimize=True)
        print(f"{ch.id}: scale {k:.3f}, idle height {h:.1f}/512, poses {os.path.getsize(pp) // 1024} KB, climb {os.path.getsize(cp) // 1024} KB")
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            for i, im in enumerate(big_poses + big_climb):
                im.save(os.path.join(args.preview, f"{ch.id}-{i:02d}.png"))


if __name__ == "__main__":
    main()
