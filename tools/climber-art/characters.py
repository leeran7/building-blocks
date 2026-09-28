"""
Panther, Otter and Raven: heads, tails and extras on the shared rig, the eight
poses, and the six-frame back-view climb.
"""

from __future__ import annotations

import math

from lowpoly import Scene, Vec, add, ellipse, facetize, rot
from rig import D2R, Character, Joints, Palette, Pose, chain

# ---------------------------------------------------------------- helpers


HS = 1.08  # head scale: big chibi heads


def put(sc: Scene, ch: Character, j: Joints, pts: list[Vec], style: str, z: float, seed: int, step: float = 16, bulge: float = 1.0, center: Vec | None = None, radii: Vec | None = None, sx: float = 1.0) -> None:
    pts = [(x * HS, y * HS) for x, y in pts]
    center = (center[0] * HS, center[1] * HS) if center else None
    radii = (radii[0] * HS, radii[1] * HS) if radii else None
    f = facetize(pts, step=step * HS, seed=seed, bulge=bulge, center=center, radii=radii)
    sc.add(f, ch.pal.style(style), j.head_center, j.head_angle, z, sx=sx)


def head_pts(j: Joints, pts: list[Vec]) -> list[Vec]:
    return [add(j.head_center, rot((p[0] * HS, p[1] * HS), j.head_angle)) for p in pts]


def eye(sc: Scene, ch: Character, j: Joints, pts: list[Vec], r: float = 6.0) -> None:
    sc.glow(head_pts(j, pts), ch.pal.eye, r)


# ---------------------------------------------------------------- panther

PANTHER_SKULL = [(-70, -10), (-62, -44), (-30, -66), (10, -68), (48, -52), (70, -24), (76, 4), (64, 34), (34, 56), (-10, 60), (-50, 46), (-72, 20)]


def panther_head(sc: Scene, ch: Character, j: Joints, z: float) -> None:
    put(sc, ch, j, [(-64, -36), (-68, -72), (-48, -86), (-26, -64)], "body", z - 0.2, 101, step=14)
    put(sc, ch, j, [(-58, -48), (-60, -72), (-46, -78), (-34, -62)], "accent", z - 0.15, 102, step=10)
    put(sc, ch, j, [(16, -62), (30, -86), (52, -80), (58, -48)], "body", z - 0.25, 103, step=14)
    put(sc, ch, j, [(26, -62), (36, -80), (48, -76), (50, -54)], "accent", z - 0.24, 104, step=10)
    put(sc, ch, j, PANTHER_SKULL, "body", z, 105, step=20, center=(0, -4), radii=(74, 66))
    put(sc, ch, j, [(-44, -52), (-10, -66), (30, -62), (46, -48), (12, -44), (-26, -36)], "accent", z + 0.1, 106, step=12, center=(0, -52), radii=(46, 16))
    put(sc, ch, j, [(-2, -30), (34, -36), (60, -26), (30, -22)], "accent", z + 0.11, 110, step=10)
    put(sc, ch, j, [(-58, 2), (-24, 14), (-42, 38)], "accent", z + 0.1, 107, step=10)
    put(sc, ch, j, [(34, 6), (66, -2), (86, 10), (88, 30), (74, 44), (46, 48), (30, 34)], "pale", z + 0.2, 108, step=14, center=(60, 24), radii=(34, 26))
    put(sc, ch, j, [(76, 6), (92, 12), (88, 24), (76, 20)], "dark", z + 0.3, 109, step=8)
    sc.line(head_pts(j, [(52, 38), (64, 42), (78, 38)]), (20, 16, 24, 255), 2.2, z + 0.35)
    eye(sc, ch, j, [(-4, -12), (12, -20), (30, -12), (12, -5)])
    eye(sc, ch, j, [(46, -14), (58, -20), (68, -14), (58, -9)], 4)


def panther_head_back(sc: Scene, ch: Character, j: Joints, z: float) -> None:
    for sx in (-1, 1):
        put(sc, ch, j, [(-66, -36), (-70, -74), (-50, -88), (-26, -62)], "body", z - 0.2, 111, step=14, sx=sx)
        put(sc, ch, j, [(-60, -48), (-62, -72), (-48, -80), (-36, -60)], "accent", z - 0.15, 112, step=10, sx=sx)
    skull = [(-72, -4), (-62, -44), (-28, -66), (28, -66), (62, -44), (72, -4), (60, 36), (26, 56), (-26, 56), (-60, 36)]
    put(sc, ch, j, skull, "body", z, 113, step=20, center=(0, -6), radii=(72, 62))
    put(sc, ch, j, [(-20, -64), (20, -64), (8, -20), (-8, -20)], "accent", z + 0.1, 114, step=10)


def panther_tail(sc: Scene, ch: Character, j: Joints, p: Pose) -> None:
    base = add(j.pelvis, rot((-34, -4), j.torso))
    w = p.tail
    angs = [60 + 10 * w, 80 + 14 * w, 110 + 18 * w, 140 + 20 * w, 170 + 20 * w]
    chain(sc, ch, base, angs, [26, 26, 24, 22, 20], [22, 20, 17, 14, 12, 9], 0.5, 0.9, 121, accent_every=3)


def panther_tail_back(sc: Scene, ch: Character, j: Joints, phase: float) -> None:
    s = math.sin(2 * math.pi * phase)
    angs = [8 * s, -6 * s + 10, 20 + 10 * s, 40 + 12 * s, 70]
    chain(sc, ch, add(j.pelvis, (0, 6)), angs, [22, 22, 20, 18, 16], [22, 20, 17, 14, 12, 9], 25, 1.0, 131, accent_every=3)


# ---------------------------------------------------------------- otter

OTTER_SKULL = [(-74, -4), (-66, -44), (-34, -70), (10, -74), (50, -58), (74, -26), (82, 8), (68, 38), (34, 56), (-12, 60), (-54, 46), (-76, 20)]


def otter_head(sc: Scene, ch: Character, j: Joints, z: float) -> None:
    put(sc, ch, j, ellipse(-56, -46, 16, 14, n=7), "body", z - 0.2, 201, step=10)
    put(sc, ch, j, ellipse(-56, -46, 8, 7, n=6), "accent", z - 0.15, 202, step=8)
    put(sc, ch, j, ellipse(38, -62, 13, 11, n=7), "body", z - 0.25, 203, step=10)
    put(sc, ch, j, OTTER_SKULL, "body", z, 204, step=20, center=(0, -6), radii=(78, 68))
    put(sc, ch, j, [(-56, -38), (-18, -62), (40, -56), (54, -38), (22, -40), (-14, -44), (-52, -24)], "accent", z + 0.1, 205, step=12, center=(0, -44), radii=(60, 22))
    put(sc, ch, j, [(-60, 4), (-34, 10), (-48, 32)], "accent", z + 0.1, 206, step=10)
    muzzle = [(20, 6), (54, -4), (84, 2), (98, 20), (92, 40), (64, 52), (30, 46), (14, 26)]
    put(sc, ch, j, muzzle, "pale", z + 0.2, 207, step=14, center=(58, 24), radii=(42, 30))
    put(sc, ch, j, [(80, 2), (100, 8), (98, 20), (84, 18)], "dark", z + 0.3, 208, step=8)
    sc.line(head_pts(j, [(60, 40), (74, 44), (88, 38)]), (60, 52, 50, 255), 2.2, z + 0.35)
    for a, b in [((80, 28), (140, 16)), ((82, 34), (142, 36)), ((78, 40), (132, 54))]:
        sc.line(head_pts(j, [a, b]), (236, 232, 222, 235), 2.4, z + 0.4)
    eye(sc, ch, j, [(-6, -16), (10, -24), (28, -16), (10, -9)])
    eye(sc, ch, j, [(50, -20), (62, -26), (72, -20), (62, -15)], 4)


def otter_head_back(sc: Scene, ch: Character, j: Joints, z: float) -> None:
    for sx in (-1, 1):
        put(sc, ch, j, ellipse(-60, -44, 16, 14, n=7), "body", z - 0.2, 211, step=10, sx=sx)
        put(sc, ch, j, ellipse(-60, -44, 8, 7, n=6), "accent", z - 0.15, 212, step=8, sx=sx)
    skull = [(-78, -4), (-66, -46), (-30, -72), (30, -72), (66, -46), (78, -4), (64, 36), (28, 56), (-28, 56), (-64, 36)]
    put(sc, ch, j, skull, "body", z, 213, step=20, center=(0, -8), radii=(78, 64))
    put(sc, ch, j, [(-40, -58), (0, -70), (40, -58), (20, -34), (-20, -34)], "accent", z + 0.1, 214, step=12)


def otter_tail(sc: Scene, ch: Character, j: Joints, p: Pose) -> None:
    base = add(j.pelvis, rot((-30, 4), j.torso))
    w = p.tail
    angs = [55 + 8 * w, 70 + 10 * w, 84 + 14 * w, 96 + 18 * w]
    chain(sc, ch, base, angs, [26, 26, 24, 22], [34, 30, 25, 19, 12], 0.5, 0.9, 221, accent_every=2)


def otter_tail_back(sc: Scene, ch: Character, j: Joints, phase: float) -> None:
    s = math.sin(2 * math.pi * phase)
    angs = [6 * s, -4 * s, 8 * s + 6, 14]
    chain(sc, ch, add(j.pelvis, (0, 8)), angs, [22, 22, 20, 18], [34, 30, 25, 19, 12], 25, 1.0, 231, accent_every=2)


# ---------------------------------------------------------------- raven

RAVEN_SKULL = [(-62, -10), (-56, -44), (-24, -66), (14, -66), (46, -50), (62, -22), (64, 10), (50, 38), (20, 54), (-18, 56), (-50, 40), (-66, 14)]
RAVEN_CREST = [
    ([(-20, -60), (-76, -98), (-44, -48)], "accent"),
    ([(-40, -46), (-104, -70), (-58, -26)], "dark"),
    ([(4, -64), (-40, -104), (-18, -56)], "dark"),
    ([(-54, -24), (-104, -32), (-64, -6)], "accent"),
    ([(20, -62), (-8, -98), (0, -60)], "accent"),
]


def raven_head(sc: Scene, ch: Character, j: Joints, z: float) -> None:
    for i, (pts, st) in enumerate(RAVEN_CREST):
        put(sc, ch, j, pts, st, z - 0.3 + i * 0.01, 301 + i, step=12)
    put(sc, ch, j, RAVEN_SKULL, "body", z, 310, step=20, center=(0, -6), radii=(64, 62))
    put(sc, ch, j, [(4, -30), (34, -36), (54, -16), (50, 8), (24, 14), (6, 0)], "pale", z + 0.1, 311, step=12, center=(30, -10), radii=(28, 24))
    put(sc, ch, j, [(-40, -48), (4, -58), (36, -48), (0, -40), (-36, -34)], "accent", z + 0.12, 312, step=10)
    put(sc, ch, j, [(46, -16), (96, -10), (124, 8), (120, 32), (106, 16), (52, 12)], "accent", z + 0.2, 313, step=12, center=(88, 4), radii=(40, 20))
    put(sc, ch, j, [(52, 12), (100, 18), (92, 32), (56, 28)], "accent", z + 0.19, 314, step=10)
    sc.line(head_pts(j, [(54, 12), (104, 17)]), (60, 36, 10, 255), 2.2, z + 0.3)
    eye(sc, ch, j, [(14, -16), (27, -23), (40, -16), (27, -10)], 4)


def raven_head_back(sc: Scene, ch: Character, j: Joints, z: float) -> None:
    crest = [
        ([(-12, -60), (-30, -110), (4, -64)], "accent"),
        ([(-2, -64), (14, -112), (20, -58)], "dark"),
        ([(-30, -54), (-62, -96), (-10, -60)], "dark"),
        ([(12, -58), (54, -98), (34, -50)], "accent"),
    ]
    for i, (pts, st) in enumerate(crest):
        put(sc, ch, j, pts, st, z - 0.3 + i * 0.01, 321 + i, step=12)
    skull = [(-64, -8), (-56, -44), (-24, -66), (24, -66), (56, -44), (64, -8), (52, 34), (22, 54), (-22, 54), (-52, 34)]
    put(sc, ch, j, skull, "body", z, 330, step=20, center=(0, -6), radii=(64, 60))
    put(sc, ch, j, [(-24, -62), (24, -62), (10, -22), (-10, -22)], "accent", z + 0.1, 331, step=10)
    for sx in (-1, 1):  # beak tip peeks past the head edge
        pass


def raven_wing(sc: Scene, ch: Character, sh: Vec, el: Vec, hd: Vec, z: float, dim: float, _back: bool) -> None:
    """Feathers trailing off the back edge of a wing-arm."""
    from lowpoly import bone_angle

    for k, (a, b, L, st) in enumerate([(sh, el, 56, "dark"), (el, hd, 66, "dark"), (el, hd, 44, "accent")]):
        ang = bone_angle(a, b)
        n = math.dist(a, b)
        y0 = 0.15 * n if k != 2 else 0.4 * n
        y1 = 0.95 * n
        pts = [(-6, y0), (-6 - L * 0.55, y0 + L * 0.35), (-10 - L * 0.7, y1 + L * 0.2), (-4, y1)]
        sc.add(facetize(pts, step=12, seed=401 + k), ch.pal.style(st), a, ang, z + k * 0.01, dim)


def raven_tail(sc: Scene, ch: Character, j: Joints, p: Pose) -> None:
    base = add(j.pelvis, rot((-28, -2), j.torso))
    for i, (a, L, st) in enumerate([(60, 64, "dark"), (78, 70, "accent"), (96, 60, "dark")]):
        ang = (a + 10 * p.tail) * D2R + j.torso
        pts = [(-9, 0), (9, 0), (13, L * 0.7), (0, L), (-13, L * 0.7)]
        sc.add(facetize(pts, step=12, seed=411 + i), ch.pal.style(st), base, ang, 0.5 + i * 0.01, 0.9)


def raven_tail_back(sc: Scene, ch: Character, j: Joints, phase: float) -> None:
    s = math.sin(2 * math.pi * phase)
    base = add(j.pelvis, (0, 8))
    for i, (a, L, st) in enumerate([(-22, 58, "dark"), (0, 66, "accent"), (22, 58, "dark")]):
        pts = [(-10, 0), (10, 0), (14, L * 0.7), (0, L), (-14, L * 0.7)]
        sc.add(facetize(pts, step=12, seed=421 + i), ch.pal.style(st), base, (a + 4 * s) * D2R, 25 + (1 - abs(i - 1)) * 0.01)


# ---------------------------------------------------------------- roster

PANTHER = Character(
    "panther",
    Palette(body="#3d3547", dark="#2a2432", accent="#b446f4", pale="#76707e", eye="#c77dff"),
    panther_head,
    panther_head_back,
    panther_tail,
    panther_tail_back,
)
OTTER = Character(
    "otter",
    Palette(body="#3a4350", dark="#29303a", accent="#3595f2", pale="#c9bda9", eye="#6cc0ff"),
    otter_head,
    otter_head_back,
    otter_tail,
    otter_tail_back,
    head_rise=64,
)
RAVEN = Character(
    "raven",
    Palette(body="#37312f", dark="#262120", accent="#f4b943", pale="#706a64", eye="#ffc94a"),
    raven_head,
    raven_head_back,
    raven_tail,
    raven_tail_back,
    arm_extra=raven_wing,
    foot="talon",
    torso_feathers=True,
    head_rise=62,
)
CHARACTERS = [PANTHER, OTTER, RAVEN]

# ---------------------------------------------------------------- poses

POSES: list[Pose] = [
    # idle
    Pose((256, 332), 2, 0, (230, 460), (286, 458), (206, 392), (312, 388)),
    # run-a: near leg forward, near arm back
    Pose((260, 328), 9, -4, (318, 456), (198, 426), (198, 350), (330, 330), near_toe=-8, far_toe=34, tail=0.8),
    # run-b: near leg back, near arm forward
    Pose((260, 328), 9, -4, (196, 428), (318, 456), (326, 336), (206, 352), near_toe=34, far_toe=-8, tail=-0.6),
    # reach-a: near arm overhead
    Pose((256, 332), -2, -8, (230, 460), (286, 458), (150, 176), (318, 390), near_bend=1.0, tail=0.3),
    # reach-b: far arm overhead
    Pose((256, 332), -2, -8, (230, 460), (286, 458), (200, 392), (372, 170), far_bend=-1.0, tail=-0.3),
    # falling: limbs spread
    Pose((256, 304), -4, -10, (202, 432), (314, 434), (160, 250), (360, 244), near_toe=24, far_toe=-18, near_bend=1.0, far_bend=-1.0, tail=1.0, open_hands=True),
    # celebrate: both arms up
    Pose((256, 330), -3, -12, (226, 460), (292, 460), (146, 186), (378, 176), near_bend=1.0, far_bend=-1.0, tail=-0.8),
    # down: crouched, a hand on the ground
    Pose((250, 396), 34, 22, (220, 460), (290, 460), (318, 452), (344, 444), near_bend=1.0, far_bend=1.0, tail=-1.0),
]
POSE_NAMES = ["idle", "run-a", "run-b", "reach-a", "reach-b", "falling", "celebrate", "down"]
CLIMB_FRAMES = 6
