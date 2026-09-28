"""Falcon: orange and charcoal feather armour, cream mask, gold beak, amber eye."""

import math

from body import head_frame, limbs, pauldron, torso
from rig import Rig, Scene, ellipse_pts, rot, shade

ID = "falcon"
PAL = {
    "body": "#2f2527",
    "belt": "#1c1617",
    "limb": "#2a2224",
    "feather": "#e8893a",
    "feather2": "#b35f2c",
    "chevron": "#f2b845",
    "cream": "#d8c6a2",
    "gold": "#f2b845",
    "hand": "#f2b845",
    "foot": "#f0b040",
    "claw": "#1a1414",
    "eye": "#ffb23a",
    "spine": "#e8893a",
}
RIG = Rig()


def feathers(sc, origin, ang, z, base_ang, n, length, width, spread, colors, k=1.0):
    """A fan of pointed feathers from origin; base_ang 0 points down."""
    for i in range(n):
        t = (i / (n - 1) - 0.5) if n > 1 else 0
        a = math.radians(base_ang + t * spread)
        L = length * (1 - 0.18 * abs(t) * 2)
        pts = [(-width / 2, 0), (width / 2, 0), (width * 0.3, L * 0.7), (0, L), (-width * 0.3, L * 0.7)]
        col = shade(colors[i % len(colors)], k)
        sc.poly(z + i * 0.01, rot(pts, origin, ang - a), col)


def head(sc: Scene, sk):
    P = head_frame(sk, RIG)
    if sk.pose.back:
        # charcoal crown, orange cap, and a nape of three broad feathers
        sc.poly(40, P(ellipse_pts(0, 0, 86, 82, n=12, start=0.2)), PAL["body"])
        sc.poly(40.1, P([(-70, -40), (-30, -80), (30, -80), (70, -40), (40, -24), (0, -30), (-40, -24)]), PAL["feather"])
        for i, x in enumerate((-44, 0, 44)):
            pts = [(x - 30, 10), (x + 30, 10), (x + 22, 58), (x, 84), (x - 22, 58)]
            sc.poly(40.3 + (0.1 if i == 1 else 0), P(pts), PAL["feather"] if i == 1 else PAL["feather2"])
        return
    # two small tufts off the back of the head
    sc.poly(39, P([(-66, -44), (-116, -62), (-84, -12)]), PAL["feather2"])
    sc.poly(39.01, P([(-74, -4), (-118, 4), (-80, 28)]), PAL["feather"])
    # skull, orange crown and nape
    sc.poly(40, P(ellipse_pts(4, 0, 90, 84, n=12, start=0.2)), PAL["body"])
    crown = [(-86, -10), (-70, -58), (-30, -86), (20, -92), (60, -74), (30, -52), (-10, -40), (-40, -6), (-58, 34), (-84, 26)]
    sc.poly(40.4, P(crown), PAL["feather"])
    # cream face and throat
    face = [(20, -12), (92, -14), (98, 14), (78, 48), (44, 66), (14, 56), (0, 24)]
    sc.poly(41, P(face), PAL["cream"])
    # charcoal band through the eye, and the falcon's dark moustache stripe
    sc.poly(41.4, P([(-12, -46), (94, -46), (98, -16), (70, -8), (20, -12)]), PAL["body"])
    sc.poly(41.5, P([(40, -14), (54, -14), (46, 28), (38, 32)]), PAL["body"])
    # big glowing eye
    sc.poly(42, P([(44, -30), (62, -44), (80, -30), (62, -16)]), PAL["eye"], glow=True)
    sc.poly(42.2, P([(58, -34), (66, -34), (66, -24), (58, -24)]), "#3a1606", edge=False)
    # hooked gold beak
    beak = [(84, -42), (120, -36), (148, -12), (146, 20), (134, 36), (128, 10), (112, 0), (86, 4)]
    sc.poly(43, P(beak), PAL["gold"])
    sc.poly(42.8, P([(86, 4), (112, 0), (118, 18), (92, 22)]), shade(PAL["gold"], 0.7))


def cape(sc, sk):
    """Folded wings behind the shoulders; they spread in the air."""
    s = sk.pose.wings
    L = RIG.torso * sk.pose.squash
    if sk.pose.back:
        for side in (-1, 1):
            root = rot([(side * 26, -L + 10)], sk.hip, sk.lean)[0]
            # a folded wing: one broad faceted blade per side
            L2 = 104
            wing = [(-side * 4, 0), (side * 30, 6), (side * 34, L2 * 0.6), (side * 16, L2), (-side * 6, L2 * 0.7)]
            sc.poly(24, rot(wing, root, sk.lean - side * math.radians(10 + 60 * s)), shade(PAL["feather2"], 0.9))
            tip = [(side * 6, L2 * 0.45), (side * 30, L2 * 0.55), (side * 16, L2), (side * 2, L2 * 0.8)]
            sc.poly(24.1, rot(tip, root, sk.lean - side * math.radians(10 + 60 * s)), PAL["feather"])
        tail = rot([(0, -10)], sk.hip, sk.lean)[0]
        feathers(sc, tail, sk.lean, 23, sk.pose.tail, 3, 70, 26, 36, [PAL["feather2"], PAL["feather"]])
        return
    root = rot([(-30, -L + 14)], sk.hip, sk.lean)[0]
    feathers(sc, root, sk.lean, 5, -18 - 80 * s, 4, 100, 32, 40 + 30 * s,
             [PAL["feather"], PAL["feather2"]], k=0.85)
    tail = rot([(-40, -14)], sk.hip, sk.lean)[0]
    feathers(sc, tail, sk.lean, 4, -40 + sk.pose.tail, 3, 72, 26, 34, [PAL["feather2"], PAL["feather"]], k=0.8)


def draw(sk, _k=1.0) -> Scene:
    sc = Scene(seed=11)
    cape(sc, sk)
    torso(sc, sk, RIG, PAL)
    if not sk.pose.back:
        # feather skirt over the hips
        skirt = rot([(-10, -14)], sk.hip, sk.lean)[0]
        feathers(sc, skirt, sk.lean, 21.5, 6, 4, 40, 26, 70, [PAL["feather"], PAL["feather2"]])
    limbs(sc, sk, PAL,
          arm_kw={"upper": "feather", "fore": "limb", "hand": "hand", "w": (32, 28, 26)},
          leg_kw={"thigh": "feather2", "shin": "gold", "foot": "foot", "toes": 3, "w": (40, 24, 22)})
    near_sh = sk.na[0]
    far_sh = sk.fa[0]
    if sk.pose.back:
        pauldron(sc, sk, near_sh, 35, PAL["feather"], 30, spikes=3)
        pauldron(sc, sk, far_sh, 35, PAL["feather"], 30, spikes=3)
    else:
        pauldron(sc, sk, far_sh, 10.8, PAL["feather"], 28, spikes=3, far=True)
        pauldron(sc, sk, near_sh, 31, PAL["feather"], 32, spikes=3)
    head(sc, sk)
    return sc
