"""Marmot: stocky copper-furred brawler, charcoal armour, cream muzzle, amber eyes."""

import math

from body import head_frame, limbs, pauldron, torso
from rig import Rig, Scene, ellipse_pts, rot, seg, shade

ID = "marmot"
PAL = {
    "body": "#3a2c26",
    "belt": "#211915",
    "fur": "#c98a52",
    "fur2": "#8a5a3a",
    "dark": "#4a3024",
    "chevron": "#e3a262",
    "cream": "#efc58e",
    "hand": "#6e4630",
    "foot": "#5a3a28",
    "claw": "#f1e0c0",
    "eye": "#ffb638",
    "nose": "#15100e",
    "spine": "#8a5a3a",
}
RIG = Rig(leg_hip_y=86, thigh=42, shin=40, torso=96, torso_w=130,
          shoulder_dx=(-34, 40), hip_dx=(-22, 22), back_shoulder=62, back_hip=28)


def head(sc: Scene, sk):
    P = head_frame(sk, RIG)
    if sk.pose.back:
        for side in (-1, 1):
            sc.poly(39.5, P(ellipse_pts(side * 50, -70, 26, 24, n=7)), PAL["fur2"])
            sc.poly(39.6, P(ellipse_pts(side * 50, -68, 13, 12, n=6)), PAL["dark"])
        sc.poly(40, P(ellipse_pts(0, 0, 90, 84, n=12, start=0.2)), PAL["fur"])
        sc.poly(40.2, P([(-30, -80), (30, -80), (22, 10), (0, 30), (-22, 10)]), PAL["fur2"])
        return
    # ears
    sc.poly(39.5, P(ellipse_pts(-36, -76, 26, 24, n=7)), PAL["fur2"])
    sc.poly(39.6, P(ellipse_pts(-34, -74, 13, 12, n=6)), PAL["dark"])
    sc.poly(39.4, P(ellipse_pts(28, -80, 20, 18, n=7)), shade(PAL["fur2"], 0.8))
    # round furry head, fuller cheeks at the back
    sc.poly(40, P([(-88, -10), (-70, -58), (-20, -86), (40, -82), (84, -50), (98, -6), (86, 40), (40, 72), (-30, 76), (-80, 44)]), PAL["fur"])
    sc.poly(40.3, P([(-88, -10), (-60, -30), (-40, 20), (-50, 66), (-80, 44)]), PAL["fur2"])
    # dark band across the eyes, like the portrait
    sc.poly(40.6, P([(-10, -52), (70, -58), (96, -30), (84, -6), (30, -12), (0, -24)]), PAL["dark"])
    # cream muzzle pushed forward, black nose
    sc.poly(41, P([(22, -6), (86, -14), (114, 10), (108, 42), (72, 62), (30, 54), (12, 26)]), PAL["cream"])
    sc.poly(42, P([(98, -10), (122, -2), (118, 18), (100, 16)]), PAL["nose"])
    sc.poly(41.8, P([(74, 36), (100, 30), (96, 40), (78, 44)]), shade(PAL["cream"], 0.6), edge=False)
    # stern amber eye under a heavy brow
    sc.poly(42, P([(40, -34), (58, -42), (72, -30), (56, -20)]), PAL["eye"], glow=True)
    sc.poly(42.2, P([(54, -36), (61, -36), (61, -27), (54, -27)]), "#3a1606", edge=False)
    sc.poly(42.5, P([(28, -54), (82, -52), (76, -40), (36, -38)]), PAL["fur2"])


def tail(sc, sk):
    sway = math.radians(sk.pose.tail)
    if sk.pose.back:
        root = rot([(0, -8)], sk.hip, sk.lean)[0]
        pts = [(-22, 0), (22, 0), (30, 40), (20, 78), (0, 90), (-20, 78), (-30, 40)]
        sc.poly(24, rot(pts, root, sk.lean + sway), PAL["fur2"])
        sc.poly(24.1, rot([(-10, 50), (10, 50), (12, 80), (0, 88), (-12, 80)], root, sk.lean + sway), PAL["dark"])
        return
    root = rot([(-RIG.torso_w * 0.4, -10)], sk.hip, sk.lean)[0]
    pts = [(-20, 0), (20, 0), (30, 36), (22, 70), (0, 84), (-22, 70), (-30, 36)]
    ang = sk.lean + math.radians(50) + sway
    sc.poly(5, rot(pts, root, ang), PAL["fur2"])
    sc.poly(5.1, rot([(-12, 46), (12, 46), (14, 76), (0, 84), (-14, 76)], root, ang), PAL["dark"])


def draw(sk, _k=1.0) -> Scene:
    sc = Scene(seed=23)
    tail(sc, sk)
    torso(sc, sk, RIG, PAL)
    limbs(sc, sk, PAL,
          arm_kw={"upper": "fur", "fore": "body", "hand": "hand", "w": (36, 32, 30)},
          leg_kw={"thigh": "fur", "shin": "body", "foot": "foot", "toes": 3, "w": (42, 34, 32), "foot_len": 38})
    near_sh, far_sh = sk.na[0], sk.fa[0]
    if sk.pose.back:
        pauldron(sc, sk, near_sh, 35, PAL["chevron"], 40)
        pauldron(sc, sk, far_sh, 35, PAL["chevron"], 40)
    else:
        pauldron(sc, sk, far_sh, 10.8, PAL["chevron"], 36, far=True)
        pauldron(sc, sk, near_sh, 31, PAL["chevron"], 42)
    head(sc, sk)
    return sc
