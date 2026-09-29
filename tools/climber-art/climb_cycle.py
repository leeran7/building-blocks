"""The climb strip's hand-over-hand cycle, shared by every climber rig.

Six back-view frames, image-right side "r", image-left side "l". Each hand
grips a rung for four frames and reaches for the next one over two; the left
hand runs three frames behind the right, so one hand is always gripping while
the other climbs past it. While a hand grips, it slides DOWN the figure by
HAND_STEP a frame: the engine raises the figure CLIMB_M_PER_FRAME (0.65 m) per
frame (climberSprite.ts), which is 36 px of the 512 pack cell at the game's
climber scale, so on screen a gripping hand holds still while the body rises
past it. Each foot steps while the opposite hand reaches, and pushes down
while it stands. The pelvis stays put (no bob, no lowest-foot snap): the
engine already moves the figure at a constant speed.

The strips this replaces sampled a sine wave at six points. A sine repeats at
those points, so frames came out doubled (1 = 2 and 4 = 5: the figure froze
then jumped) or mirrored (1 = 5 and 2 = 4: the arms pumped up and back down
like waving instead of climbing).

Every value here is in pack px (the 512 cell). Rigs place the grip `top` and
the hand x themselves and map the numbers onto their own skeleton.
"""

from __future__ import annotations

import math

FRAMES = 6
HAND_STEP = 36.0  # pack px a gripping hand slides down per frame
FOOT_STEP = 20.0  # pack px a standing foot pushes down per frame
REACH_OUT = 22.0  # pack px a reaching hand swings outward, clear of the rung


def _hand_k(i: int, side: str) -> int:
    return (i + (0 if side == "r" else 3)) % FRAMES


def hand(i: int, side: str) -> tuple[float, float, bool]:
    """(drop, out, reaching) for a hand in frame i.

    drop: pack px below the highest grip (0 = hand at the top rung).
    out: pack px to move the hand outward, away from the body's centre line.
    """
    k = _hand_k(i, side)
    if k < 4:  # gripping: slides down with the ladder, 0, 36, 72, 108
        return k * HAND_STEP, 0.0, False
    # reaching from 108 back up to 0, arcing outward; ends a little short of
    # the top so the grab in frame 0 still reads as a catch
    drop = (70.0, 22.0)[k - 4]
    return drop, REACH_OUT, True


def foot(i: int, side: str) -> tuple[float, bool]:
    """(lift, stepping) for a foot in frame i: lift in pack px above the anchor.

    The left foot steps while the right hand reaches, and vice versa.
    """
    k = _hand_k(i, "l" if side == "r" else "r")  # the opposite hand's phase
    if k < 4:  # standing: placed high, pushes down 60, 40, 20, 0
        return (3 - k) * FOOT_STEP, False
    return (24.0, 58.0)[k - 4], True


LIFT_MAX = 3 * FOOT_STEP


def ik(root: tuple[float, float], target: tuple[float, float], l1: float, l2: float,
       bend: float) -> tuple[tuple[float, float], tuple[float, float], float]:
    """Two-bone IK. Returns (joint, end, stretch).

    bend picks the side the joint bows to: +1 bows a downward limb toward +x
    (image right) and an upward limb toward -x; -1 the reverse.
    When the target is out of reach both bones stretch (stretch > 1), as the
    chibi rigs already do for overhead reaches.
    """
    dx, dy = target[0] - root[0], target[1] - root[1]
    d = math.hypot(dx, dy) or 1e-6
    stretch = 1.0
    if d > (l1 + l2) * 0.985:
        stretch = d / ((l1 + l2) * 0.985)
    a, b = l1 * stretch, l2 * stretch
    cos_a = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
    ang = math.acos(cos_a)
    ux, uy = dx / d, dy / d
    # rotate the root→target unit vector by ±ang (screen coords, y down)
    s = -bend
    jx = ux * math.cos(s * ang) - uy * math.sin(s * ang)
    jy = ux * math.sin(s * ang) + uy * math.cos(s * ang)
    joint = (root[0] + jx * a, root[1] + jy * a)
    return joint, target, stretch


def limb_deg(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Angle of a→b in the angle rigs' convention: 0 = down, +90 = image right."""
    return math.degrees(math.atan2(b[0] - a[0], b[1] - a[1]))
