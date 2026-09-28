"""Gecko: charcoal scales with lime stripes, bulging emerald eyes, long tail."""

import math

from body import head_frame, limbs, pauldron, torso
from rig import Rig, Scene, ellipse_pts, limb_end, rot, seg, shade

ID = "gecko"
PAL = {
    "body": "#33362e",
    "belt": "#1d1f1a",
    "limb": "#3c3f36",
    "lime": "#b8ec3a",
    "green": "#7fc91c",
    "olive": "#5e6b45",
    "chevron": "#b8ec3a",
    "hand": "#7fc91c",
    "foot": "#7fc91c",
    "claw": "#b8ec3a",
    "eye": "#5ce83a",
    "spine": "#b8ec3a",
}
RIG = Rig(leg_hip_y=92, thigh=46, shin=42, torso=98, torso_w=100,
          shoulder_dx=(-24, 32), hip_dx=(-18, 18))


def eye(sc, P, cx, cy, z):
    sc.poly(z, P(ellipse_pts(cx, cy, 36, 34, n=9)), PAL["body"])
    sc.poly(z + 0.1, P(ellipse_pts(cx + 4, cy, 26, 25, n=9)), PAL["eye"], glow=True)
    sc.poly(z + 0.2, P([(cx + 1, cy - 20), (cx + 8, cy - 20), (cx + 8, cy + 20), (cx + 1, cy + 20)]), "#08140a", edge=False)


def head(sc: Scene, sk):
    P = head_frame(sk, RIG)
    if sk.pose.back:
        sc.poly(40, P([(-96, -10), (-70, -56), (0, -70), (70, -56), (96, -10), (80, 40), (0, 62), (-80, 40)]), PAL["body"])
        for side in (-1, 1):
            sc.poly(40.3, P(ellipse_pts(side * 56, -52, 32, 30, n=8)), PAL["body"])
            sc.poly(40.4, P(ellipse_pts(side * 60, -60, 20, 14, n=7)), PAL["green"])
        sc.poly(40.5, P([(-14, -66), (14, -66), (12, 56), (-12, 56)]), PAL["lime"])
        return
    # wide flat lizard head, long snout to the right
    skull = [(-78, -20), (-50, -62), (10, -74), (70, -58), (126, -30), (150, -4), (140, 22), (90, 40), (10, 52), (-60, 38)]
    sc.poly(40, P(skull), PAL["body"])
    # lime stripe over the crown and down the neck, green along the jaw
    sc.poly(40.3, P([(-76, -14), (-44, -52), (10, -62), (-10, -40), (-50, -6), (-66, 24)]), PAL["lime"])
    sc.poly(40.3, P([(70, -44), (124, -24), (118, -12), (72, -28)]), PAL["green"])
    sc.poly(40.4, P([(0, 22), (132, 10), (138, 20), (90, 38), (10, 46)]), PAL["olive"])
    sc.poly(40.5, P([(20, 20), (136, 12), (132, 18), (24, 28)]), PAL["lime"], edge=False)
    sc.poly(40.6, P([(126, -12), (134, -12), (134, -4), (126, -4)]), "#0c0e0a", edge=False)
    # the big eye bulges out of the top of the head
    eye(sc, P, 40, -54, 41)


def tail(sc, sk):
    """A long striped tail: chained tapering segments."""
    sway = sk.pose.tail
    if sk.pose.back:
        p = rot([(0, -6)], sk.hip, sk.lean)[0]
        angs = [4 + sway * 0.5, 10 + sway, 18 + sway * 1.5, 30 + sway * 2]
        z, zstep = 24, 0.01
    else:
        p = rot([(-RIG.torso_w * 0.36, -8)], sk.hip, sk.lean)[0]
        angs = [-58 + sway, -78 + sway, -96 + sway * 1.2, -128 + sway * 1.5, -160 + sway * 2]
        z, zstep = 4, -0.01
    w = 34.0
    for i, a in enumerate(angs):
        q = limb_end(p, 34 - i * 2, a)
        w2 = w * 0.78
        sc.poly(z + i * zstep, seg(p, q, w, w2, 0.05, n=2), PAL["body"] if i % 2 == 0 else PAL["green"])
        p, w = q, w2


def draw(sk, _k=1.0) -> Scene:
    sc = Scene(seed=37)
    tail(sc, sk)
    # a neck: the flat head sits higher than a round one would
    sc.poly(19.5, seg(sk.neck, sk.head, 50, 44, 0.0, n=2), PAL["body"])
    torso(sc, sk, RIG, PAL)
    limbs(sc, sk, PAL,
          arm_kw={"upper": "limb", "fore": "green", "hand": "hand", "w": (30, 26, 24)},
          leg_kw={"thigh": "limb", "shin": "green", "foot": "foot", "toes": 3, "w": (36, 28, 24), "foot_len": 44})
    near_sh, far_sh = sk.na[0], sk.fa[0]
    if sk.pose.back:
        pauldron(sc, sk, near_sh, 35, PAL["lime"], 30, spikes=3)
        pauldron(sc, sk, far_sh, 35, PAL["lime"], 30, spikes=3)
    else:
        pauldron(sc, sk, far_sh, 10.8, PAL["lime"], 28, spikes=3, far=True)
        pauldron(sc, sk, near_sh, 31, PAL["lime"], 32, spikes=3)
    head(sc, sk)
    return sc
