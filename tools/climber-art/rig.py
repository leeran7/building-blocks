"""
Shared chibi body rig: torso, two-bone arms and legs, feet and hands, in a
three-quarter right-facing view (poses sheet) and a back view (climb strip).
Characters supply their palette, head, tail and extras (characters.py).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

from lowpoly import (
    ANCHOR,
    Scene,
    Style,
    Vec,
    add,
    bone_angle,
    capsule,
    ellipse,
    facetize,
    hex_rgb,
    ik,
    rot,
)

THIGH, SHIN, ANKLE_H = 50.0, 44.0, 16.0
UPPER, FORE = 54.0, 48.0
WIDE = 1.28  # torso width factor: chibi, chunky
D2R = math.pi / 180


@dataclass
class Palette:
    body: str
    dark: str
    accent: str
    pale: str
    eye: str

    def style(self, name: str) -> Style:
        if name == "accent":
            return Style(hex_rgb(self.accent), ambient=0.52, diffuse=0.62, spec=0.12)
        if name == "pale":
            return Style(hex_rgb(self.pale), ambient=0.45, diffuse=0.62, spec=0.06)
        if name == "dark":
            return Style(hex_rgb(self.dark), ambient=0.40, diffuse=0.75, spec=0.08)
        return Style(hex_rgb(self.body))


@dataclass
class Pose:
    pelvis: Vec
    torso: float  # degrees, + leans toward facing
    head: float
    near_foot: Vec
    far_foot: Vec
    near_hand: Vec
    far_hand: Vec
    near_toe: float = 0.0
    far_toe: float = 0.0
    near_bend: float = -1.0
    far_bend: float = -1.0
    knee_bend: tuple[float, float] = (1.0, 1.0)
    tail: float = 0.0  # tail swing, -1…1
    open_hands: bool = False


@dataclass
class Joints:
    pelvis: Vec
    torso: float  # radians
    neck: Vec
    head_center: Vec
    head_angle: float
    shoulders: dict[str, Vec]
    elbows: dict[str, Vec]
    hands: dict[str, Vec]
    hips: dict[str, Vec]
    knees: dict[str, Vec]
    ankles: dict[str, Vec]


@dataclass
class Character:
    id: str
    pal: Palette
    head_front: Callable[[Scene, "Character", Joints, float], None]
    head_back: Callable[[Scene, "Character", Joints, float], None]
    tail_front: Callable[[Scene, "Character", Joints, Pose], None] | None = None
    tail_back: Callable[[Scene, "Character", Joints, float], None] | None = None
    arm_extra: Callable[[Scene, "Character", Vec, Vec, Vec, float, float, bool], None] | None = None
    foot: str = "paw"  # paw | talon
    torso_feathers: bool = False
    head_rise: float = 66.0
    extras: dict = field(default_factory=dict)


# ---------------------------------------------------------------- parts

TORSO = [(-40, 12), (-46, -18), (-52, -56), (-46, -82), (-20, -94), (20, -94), (44, -84), (52, -58), (44, -18), (38, 12), (0, 18)]
CHEVRON = [(-34, -80), (6, -52), (42, -82), (46, -66), (6, -34), (-38, -64)]
BELT = [(-44, -16), (42, -16), (40, -2), (-42, -2)]
HIP_NEAR = [(-44, -4), (-16, -2), (-30, 24)]
HIP_FAR = [(14, -2), (40, -4), (30, 22)]
COLLAR = [(-30, -92), (0, -100), (30, -92), (22, -80), (-22, -80)]

BACK_CHEVRON = [(-40, -78), (0, -52), (40, -78), (40, -62), (0, -36), (-40, -62)]
FOOT_PAW = [(-22, -8), (4, -12), (28, -2), (36, 10), (32, 16), (-24, 16), (-28, 4)]
FOOT_BACK = [(-20, -8), (20, -8), (25, 8), (21, 16), (-21, 16), (-25, 8)]
FIST = ellipse(0, 0, 20, 18, n=8, phase=0.3)
OPEN_HAND = [(-12, -10), (12, -10), (18, 6), (20, 22), (10, 18), (4, 28), (-4, 20), (-12, 26), (-16, 10)]


def _limb(scene: Scene, ch: Character, a: Vec, b: Vec, w0: float, w1: float, z: float, dim: float, seed: int, style: str = "body", band: tuple[float, float] | None = None) -> None:
    L = math.dist(a, b)
    ang = bone_angle(a, b)
    f = facetize(capsule(L, w0, w1), step=18, seed=seed, bulge=1.0, center=(0, L / 2), radii=(w0 / 2, L / 2 + 8))
    scene.add(f, ch.pal.style(style), a, ang, z, dim)
    if band:
        y0, y1 = band[0] * L, band[1] * L
        hw0 = w0 / 2 + (w1 - w0) / 2 * band[0] + 1.5
        hw1 = w0 / 2 + (w1 - w0) / 2 * band[1] + 1.5
        poly = [(-hw0, y0), (hw0, y0 - 3), (hw1, y1), (-hw1, y1 + 3)]
        fb = facetize(poly, step=12, seed=seed + 50, center=(0, (y0 + y1) / 2), radii=(hw0, (y1 - y0) / 2 + 4))
        scene.add(fb, ch.pal.style("accent"), a, ang, z + 0.05, dim)


def _foot(scene: Scene, ch: Character, ankle: Vec, toe_deg: float, z: float, dim: float, seed: int, back: bool = False) -> None:
    pts = FOOT_BACK if back else FOOT_PAW
    f = facetize(pts, step=13, seed=seed, center=(4, 2), radii=(26, 14))
    scene.add(f, ch.pal.style("dark"), ankle, toe_deg * D2R, z, dim)
    if back:
        return
    if ch.foot == "talon":
        claws = [[(22, 8), (40, 12), (26, 16)], [(14, 12), (32, 20), (16, 17)]]
        for i, c in enumerate(claws):
            scene.add(facetize(c, step=10, seed=seed + 7 + i), ch.pal.style("pale"), ankle, toe_deg * D2R, z + 0.02 + i * 0.01, dim)
    cap = [(8, -10), (24, -2), (30, 8), (14, 4)]
    scene.add(facetize(cap, step=10, seed=seed + 3), ch.pal.style("accent"), ankle, toe_deg * D2R, z + 0.03, dim)


def _hand(scene: Scene, ch: Character, elbow: Vec, hand: Vec, z: float, dim: float, seed: int, open_: bool) -> None:
    ang = bone_angle(elbow, hand)
    ctr = add(hand, rot((0, 12), ang))
    pts = OPEN_HAND if open_ else FIST
    f = facetize(pts, step=10, seed=seed, center=(0, 4), radii=(18, 18))
    scene.add(f, ch.pal.style("dark"), ctr, ang, z, dim)


def _arm(scene: Scene, ch: Character, sh: Vec, target: Vec, bend: float, z: float, dim: float, seed: int, open_: bool) -> tuple[Vec, Vec]:
    el, hd = ik(sh, target, UPPER, FORE, bend)
    if ch.arm_extra:
        ch.arm_extra(scene, ch, sh, el, hd, z - 0.3, dim, False)
    _limb(scene, ch, sh, el, 34, 30, z, dim, seed)
    _limb(scene, ch, el, hd, 30, 28, z + 0.1, dim, seed + 1, band=(0.35, 0.85))
    _hand(scene, ch, el, hd, z + 0.2, dim, seed + 2, open_)
    return el, hd


def _leg(scene: Scene, ch: Character, hip: Vec, foot: Vec, toe: float, bend: float, z: float, dim: float, seed: int, back: bool = False) -> tuple[Vec, Vec]:
    ankle_t = (foot[0], foot[1] - ANKLE_H)
    kn, an = ik(hip, ankle_t, THIGH, SHIN, bend)
    _limb(scene, ch, hip, kn, 46, 40, z, dim, seed, band=None)
    _limb(scene, ch, kn, an, 40, 36, z + 0.1, dim, seed + 1, band=(0.1, 0.5))
    _foot(scene, ch, an, toe if not back else 0, z + 0.2, dim, seed + 2, back)
    return kn, an


def wide(pts: list[Vec]) -> list[Vec]:
    return [(x * WIDE, y) for x, y in pts]


def _torso(scene: Scene, ch: Character, P: Vec, t: float, z: float, back: bool) -> None:
    s = ch.pal
    scene.add(facetize(wide(TORSO), step=24, seed=11, center=(0, -44), radii=(52 * WIDE, 60)), s.style("body"), P, t, z)
    scene.add(facetize(wide(BELT), step=14, seed=12, bulge=0.6), s.style("dark"), P, t, z + 0.1)
    scene.add(facetize(wide(BACK_CHEVRON if back else CHEVRON), step=14, seed=13, center=(0, -60), radii=(46 * WIDE, 40)), s.style("accent"), P, t, z + 0.2)
    if not back:
        scene.add(facetize(wide(COLLAR), step=14, seed=14, bulge=0.6), s.style("dark"), P, t, z + 0.15)
    for i, hp in enumerate((HIP_NEAR, HIP_FAR) if not back else ([(-44, -4), (-12, -2), (-30, 24)], [(12, -2), (44, -4), (30, 24)])):
        scene.add(facetize(wide(hp), step=12, seed=15 + i), s.style("accent" if i == 0 or back else "body"), P, t, z + 0.3)
    if ch.torso_feathers:
        for i, (x, y) in enumerate([(-46, -30), (-50, -56)] if not back else [(-48, -40), (48, -40)]):
            sgn = -1 if x < 0 else 1
            x *= WIDE
            f = [(x, y), (x + sgn * 22, y + 26), (x + sgn * 4, y + 14)]
            scene.add(facetize(f, step=10, seed=17 + i), s.style("dark"), P, t, z - 0.2)


def _pauldron(scene: Scene, ch: Character, sh: Vec, el: Vec, z: float, dim: float, seed: int) -> None:
    ang = bone_angle(sh, el) * 0.45
    pts = [(-24, -12), (-6, -22), (18, -18), (28, -2), (20, 16), (-4, 20), (-22, 10)]
    scene.add(facetize(pts, step=12, seed=seed, center=(0, -4), radii=(26, 20)), ch.pal.style("accent"), sh, ang, z, dim)


# ---------------------------------------------------------------- views


def front(ch: Character, p: Pose) -> Scene:
    sc = Scene()
    P = p.pelvis
    t = p.torso * D2R
    neck = add(P, rot((6, -88), t))
    h = t + p.head * D2R
    head_c = add(neck, rot((6, -ch.head_rise), h))
    sh = {"near": add(P, rot((-50, -72), t)), "far": add(P, rot((44, -76), t))}
    hips = {"near": add(P, rot((-24, 4), t)), "far": add(P, rot((26, 0), t))}
    j = Joints(P, t, neck, head_c, h, sh, {}, {}, hips, {}, {})
    FAR = 0.68
    if ch.tail_front:
        ch.tail_front(sc, ch, j, p)
    el, hd = _arm(sc, ch, sh["far"], p.far_hand, p.far_bend, 2, FAR, 31, p.open_hands)
    j.elbows["far"], j.hands["far"] = el, hd
    kn, an = _leg(sc, ch, hips["far"], p.far_foot, p.far_toe, p.knee_bend[1], 5, FAR, 41)
    j.knees["far"], j.ankles["far"] = kn, an
    _pauldron(sc, ch, sh["far"], el, 9, FAR, 61)
    _torso(sc, ch, P, t, 10, back=False)
    kn, an = _leg(sc, ch, hips["near"], p.near_foot, p.near_toe, p.knee_bend[0], 12, 1.0, 51)
    j.knees["near"], j.ankles["near"] = kn, an
    raised = p.near_hand[1] < sh["near"][1] - 20  # a raised arm passes in front of the head
    za = 22 if raised else 16
    el, hd = _arm(sc, ch, sh["near"], p.near_hand, p.near_bend, za, 1.0, 21, p.open_hands)
    j.elbows["near"], j.hands["near"] = el, hd
    _pauldron(sc, ch, sh["near"], el, za + 1, 1.0, 62)
    ch.head_front(sc, ch, j, 20)
    return sc


def back(ch: Character, phase: float) -> Scene:
    """One climb-strip frame: back view, hands on rungs, feet alternating."""
    sc = Scene()
    c = math.cos(2 * math.pi * phase)
    P = (256.0, 330.0 - 3.0 * math.cos(4 * math.pi * phase))
    t = 0.0
    neck = add(P, (0, -88))
    head_c = add(neck, (0, -ch.head_rise))
    sh = {"l": add(P, (-54, -74)), "r": add(P, (54, -74))}
    hips = {"l": add(P, (-26, 2)), "r": add(P, (26, 2))}
    j = Joints(P, t, neck, head_c, 0.0, sh, {}, {}, hips, {}, {})
    hand = {"r": (352.0, 168 - 50 * c), "l": (160.0, 168 + 50 * c)}
    foot = {"l": (224.0, 460 - 20 * (1 + c)), "r": (288.0, 460 - 20 * (1 - c))}
    for side, bend, zz, seed in (("l", 1.0, 22, 21), ("r", -1.0, 22, 31)):
        el, hd = _arm(sc, ch, sh[side], hand[side], bend, zz, 0.9, seed, False)
        j.elbows[side], j.hands[side] = el, hd
    _torso(sc, ch, P, t, 10, back=True)
    for side, bend, seed in (("l", -1.0, 41), ("r", 1.0, 51)):
        kn, an = _leg(sc, ch, hips[side], foot[side], 0, bend, 12, 1.0, seed, back=True)
        j.knees[side], j.ankles[side] = kn, an
    for side, seed in (("l", 61), ("r", 62)):
        _pauldron(sc, ch, sh[side], j.elbows[side], 21, 1.0, seed)
    ch.head_back(sc, ch, j, 20)
    if ch.tail_back:
        ch.tail_back(sc, ch, j, phase)
    return sc


def chain(scene: Scene, ch: Character, start: Vec, angles: list[float], lengths: list[float], widths: list[float], z: float, dim: float, seed: int, style: str = "body", accent_every: int = 0) -> Vec:
    """A tapered segment chain (tails). angles are absolute, degrees from +y."""
    p = start
    for i, (a, L) in enumerate(zip(angles, lengths)):
        d = rot((0, L), a * D2R)
        q = add(p, d)
        st = "accent" if accent_every and i % accent_every == accent_every - 1 else style
        _limb(scene, ch, p, q, widths[i], widths[i + 1], z + i * 0.01, dim, seed + i, style=st)
        p = q
    return p
