#!/usr/bin/env python3
"""Measure how smoothly a compiled character's walk and climb play, Wraith as reference.

Replays climberSprite.ts's cycle maths (distance-driven frames, a smoothstep
crossfade of `blend` either side of each boundary) at the display rate and
sums how much the drawn figure changes from one displayed frame to the next.
A cycle is smooth when no displayed frame differs much from the last one;
the number reported is the largest such change over a loop, in changed
pixel-equivalents (sum of |delta premultiplied RGB| / 255), with the mean
beside it. `--strip` writes the displayed frames of one cycle side by side
so the numbers can be checked by eye.

    python3 scripts/climber-art/smoothness.py --all
    python3 scripts/climber-art/smoothness.py otter --climb-blend 0.5 --strip otter.png
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_paid import CELL, IDS, REPO  # noqa: E402

SHEETS = REPO / 'app/public/climb'
# climberSprite.ts / towers.ts: metres per frame and the game's speeds.
WALK_M_PER_STEP = 4.5
CLIMB_M_PER_FRAME = 0.65
MOVE_SPEED = 14.0
CLIMB_SPEED = 9.0
FPS = 60


def smooth(t: float) -> float:
    return t * t * (3 - 2 * t)


def cells(sheet: Path, cols: int, count: int) -> list[np.ndarray]:
    image = Image.open(sheet).convert('RGBA')
    out = []
    for i in range(count):
        cell = image.crop(((i % cols) * CELL, (i // cols) * CELL, (i % cols + 1) * CELL, (i // cols + 1) * CELL))
        rgba = np.asarray(cell).astype(np.float32) / 255
        rgba[:, :, :3] *= rgba[:, :, 3:4]  # premultiplied, as the engine composites
        out.append(rgba)
    return out


def displayed(frames: list[np.ndarray], phase: float, blend: float) -> np.ndarray:
    """What climberFrame draws at this cycle phase (frame units)."""
    n = len(frames)
    whole = int(np.floor(phase))
    f = phase - whole
    i = whole % n
    j, w = i, 0.0
    if blend > 0 and f > 1 - blend:
        j, w = (whole + 1) % n, 0.5 * smooth((f - (1 - blend)) / blend)
    elif blend > 0 and f < blend:
        j, w = (whole - 1) % n, 0.5 * smooth(1 - f / blend)
    return frames[i] * (1 - w) + frames[j] * w


def replay(frames: list[np.ndarray], metres_per_frame: float, speed: float, blend: float,
           loops: int = 1) -> list[np.ndarray]:
    seconds = loops * len(frames) * metres_per_frame / speed
    count = int(round(seconds * FPS))
    return [displayed(frames, (k / FPS) * speed / metres_per_frame, blend) for k in range(count)]


def change(sequence: list[np.ndarray]) -> tuple[float, float]:
    deltas = [float(np.abs(b[:, :, :3] - a[:, :, :3]).sum()) for a, b in zip(sequence, sequence[1:] + sequence[:1])]
    return max(deltas), sum(deltas) / len(deltas)


def measure(character: str, walk_blend: float, climb_blend: float) -> dict:
    poses = cells(SHEETS / f'{character}-poses-192.png', 4, 8)
    climb = cells(SHEETS / f'{character}-climb-192.png', 6, 6)
    walk_max, walk_mean = change(replay([poses[1], poses[2]], WALK_M_PER_STEP, MOVE_SPEED, walk_blend))
    climb_max, climb_mean = change(replay(climb, CLIMB_M_PER_FRAME, CLIMB_SPEED, climb_blend))
    return {'id': character, 'walkMax': walk_max, 'walkMean': walk_mean,
            'climbMax': climb_max, 'climbMean': climb_mean}


def strip(character: str, kind: str, blend: float, path: Path) -> None:
    if kind == 'climb':
        frames = cells(SHEETS / f'{character}-climb-192.png', 6, 6)
        shown = replay(frames, CLIMB_M_PER_FRAME, CLIMB_SPEED, blend)
    else:
        poses = cells(SHEETS / f'{character}-poses-192.png', 4, 8)
        shown = replay([poses[1], poses[2]], WALK_M_PER_STEP, MOVE_SPEED, blend)
    size = 96
    background = np.array([24, 22, 30], dtype=np.float32) / 255
    sheet = Image.new('RGB', (size * len(shown), size))
    for k, rgba in enumerate(shown):
        rgb = rgba[:, :, :3] + background * (1 - rgba[:, :, 3:4])  # premultiplied over the background
        cell = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
        sheet.paste(cell, (k * size, 0))
    sheet.save(path)


def main() -> int:
    cli = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    cli.add_argument('characters', nargs='*', help='sheet ids, e.g. wraith or otter-void')
    cli.add_argument('--all', action='store_true', help='the Wraith and every Void skin')
    cli.add_argument('--walk-blend', type=float, default=0.14)
    cli.add_argument('--climb-blend', type=float, default=0.14)
    cli.add_argument('--strip', type=Path, help='write the displayed frames of one character to this PNG')
    cli.add_argument('--kind', choices=('walk', 'climb'), default='climb', help='which cycle --strip shows')
    args = cli.parse_args()
    selected = (['wraith'] + [f'{i}-void' for i in IDS]) if args.all else args.characters
    if not selected:
        cli.error('name characters or pass --all')
    if args.strip:
        strip(selected[0], args.kind, args.climb_blend if args.kind == 'climb' else args.walk_blend, args.strip)
        return 0
    print(f'{"id":14} {"walk max":>9} {"walk mean":>9} {"climb max":>9} {"climb mean":>10}')
    for character in selected:
        m = measure(character, args.walk_blend, args.climb_blend)
        print(f'{m["id"]:14} {m["walkMax"]:9.0f} {m["walkMean"]:9.0f} {m["climbMax"]:9.0f} {m["climbMean"]:10.0f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
