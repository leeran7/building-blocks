"""Render climber sheets: python3 build.py <id> [--out DIR] [--preview DIR].

Writes <id>-poses-192.png (4x2) and <id>-climb-192.png (6x1) into
app/public/climb/ (or --out), palette-quantised like the Wraith sheets.
"""

from __future__ import annotations

import argparse
import importlib
import os

from climber import POSES
from rig import OUT, fit, ground_shift, quantise, render, sheet

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "..", "..", "..", "app", "public", "climb")


def cells(char):
    idle = char.build(POSES[0])
    k = fit(idle)
    poses = []
    for p in POSES:
        p = {**p, **char.pose_overrides.get(p["name"], {})}
        S = char.build(p)
        poses.append(render(S, k, ground_shift(S, k, p.get("lift", 0) * k)))
    climb = []
    # Climb frames hang from one fixed root (frame 0 has a foot on the anchor),
    # so a lifted foot rises instead of the whole body dropping to meet it.
    shift = ground_shift(char.build_back(0), k)
    for t in range(6):
        climb.append(render(char.build_back(t), k, shift))
    return poses, climb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--out", default=DEFAULT_OUT)
    a = ap.parse_args()
    for cid in a.ids:
        char = importlib.import_module(cid).CHARACTER
        poses, climb = cells(char)
        for kind, cs, cols in (("poses", poses, 4), ("climb", climb, 6)):
            path = os.path.join(a.out, f"{cid}-{kind}-{OUT}.png")
            quantise(sheet(cs, cols)).save(path, optimize=True)
            print(path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
