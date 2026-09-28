"""Shared chibi body parts: torso, limbs, hands and feet.

Z order, front (three-quarter) view: back extras 5, far arm 10, far leg 12,
near leg 18, torso 20, chest details 22, head 40, near arm 30. Back view: legs
18, torso 20, back extras 24 (tail and cape sit over the torso), arms 34,
head 40.
"""

from __future__ import annotations

import math

from rig import Scene, Skel, ellipse_pts, rot, seg, shade

FAR = 0.62  # far limbs are darker for depth


def torso(sc: Scene, sk: Skel, rig, pal, width_k=1.0, belly=None):
    w = rig.torso_w * width_k
    L = rig.torso * sk.pose.squash
    back = sk.pose.back
    off = 0 if back else 6
    local = [
        (-w * 0.40 + off, 8), (w * 0.40 + off, 8),
        (w * 0.44 + off, -26), (w * 0.52 + off, -L * 0.62),
        (w * 0.44 + off, -L + 4), (w * 0.18 + off, -L - 10),
        (-w * 0.18 + off, -L - 10), (-w * 0.44 + off, -L + 4),
        (-w * 0.50 + off, -L * 0.62), (-w * 0.42 + off, -26),
    ]
    sc.poly(20, rot(local, sk.hip, sk.lean), pal["body"])
    # belt
    belt = [(-w * 0.43 + off, -4), (w * 0.43 + off, -4), (w * 0.45 + off, -20), (-w * 0.45 + off, -20)]
    sc.poly(21, rot(belt, sk.hip, sk.lean), pal.get("belt", shade(pal["body"], 0.7)))
    if belly and not back:
        bl = [(-w * 0.1 + off + 8, -24), (w * 0.34 + off, -26), (w * 0.38 + off, -L * 0.6), (w * 0.05 + off, -L * 0.72)]
        sc.poly(21, rot(bl, sk.hip, sk.lean), belly)
    if not back:
        # chevron chest plate, pushed toward the front of a three-quarter body
        cx = off + 10
        ch = [
            (cx - w * 0.34, -L * 0.86), (cx + 2, -L * 0.60), (cx + w * 0.38, -L * 0.86),
            (cx + w * 0.38, -L * 0.70), (cx + 2, -L * 0.42), (cx - w * 0.34, -L * 0.70),
        ]
        sc.poly(22, rot(ch, sk.hip, sk.lean), pal["chevron"])
    else:
        # a spine ridge in the accent reads as the back view at small size
        sp = [(-8, -L * 0.2), (8, -L * 0.2), (10, -L * 0.8), (0, -L * 0.9), (-10, -L * 0.8)]
        sc.poly(22, rot(sp, sk.hip, sk.lean), pal.get("spine", shade(pal["body"], 0.8)))


def pauldron(sc: Scene, sk: Skel, root, z, color, size=34, spikes=0, far=False):
    col = shade(color, FAR) if far else color
    pts = ellipse_pts(0, 0, size * 0.95, size * 0.7, n=9, start=math.pi)
    if spikes:
        spk = []
        for i in range(spikes):
            a = math.pi + (i + 0.5) * math.pi / spikes
            spk.append((math.cos(a) * size * 1.35, math.sin(a) * size * 1.2))
        # spikes along the top edge
        pts = []
        for i in range(spikes * 2 + 1):
            a = math.pi + i * math.pi / (spikes * 2)
            r = 1.45 if i % 2 else 0.95
            pts.append((math.cos(a) * size * r, math.sin(a) * size * 0.75 * r))
        pts += [(size * 0.8, size * 0.5), (-size * 0.8, size * 0.5)]
    sc.poly(z, rot(pts, root, sk.lean), col)


def arm(sc: Scene, sk: Skel, joints, z, pal, far=False, upper="limb", fore="limb", hand="hand", w=(30, 26, 24)):
    k = FAR if far else 1.0
    a, m, e = joints
    sc.poly(z, seg(a, m, w[0], w[1], 0.15), shade(pal[upper], k))
    sc.poly(z + 0.2, seg(m, e, w[1], w[2], 0.12), shade(pal[fore], k))
    hx, hy = e
    sc.poly(z + 0.4, ellipse_pts(hx, hy, 15, 14, n=7, start=0.3), shade(pal[hand], k))


def leg(sc: Scene, sk: Skel, joints, z, pal, far=False, thigh="limb", shin="limb", foot="foot", w=(34, 28, 26), foot_len=40, toes=0):
    k = FAR if far else 1.0
    a, m, e = joints
    sc.poly(z, seg(a, m, w[0], w[1], 0.18), shade(pal[thigh], k))
    sc.poly(z + 0.2, seg(m, e, w[1], w[2], 0.1), shade(pal[shin], k))
    fc = shade(pal[foot], k)
    if sk.pose.back:
        # seen from behind: the heel, a squat block under the shin
        pts = [(-17, -14), (17, -14), (19, 6), (-19, 6)]
        sc.poly(z + 0.4, rot(pts, e, 0), fc)
        return
    # the sole follows the shin a little, so kicked-back feet point down
    shin_ang = math.degrees(math.atan2(e[0] - m[0], e[1] - m[1]))
    tilt = max(-60.0, min(40.0, -shin_ang * 0.6))
    pts = [(-16, -18), (foot_len * 0.55, -16), (foot_len, -4), (foot_len - 2, 6), (-18, 6)]
    sc.poly(z + 0.4, rot(pts, e, math.radians(tilt)), fc)
    for i in range(toes):
        tx = foot_len - 4 - i * 9
        claw = [(tx, 0), (tx + 12, 8), (tx + 2, 8)]
        sc.poly(z + 0.5, rot(claw, e, math.radians(tilt)), shade(pal.get("claw", "#1a1414"), k), edge=False)


def limbs(sc: Scene, sk: Skel, pal, arm_kw=None, leg_kw=None):
    """Both arms and legs at the view's z order."""
    arm_kw = arm_kw or {}
    leg_kw = leg_kw or {}
    if sk.pose.back:
        leg(sc, sk, sk.nl, 18, pal, **leg_kw)
        leg(sc, sk, sk.fl, 18, pal, **leg_kw)
        arm(sc, sk, sk.na, 34, pal, **arm_kw)
        arm(sc, sk, sk.fa, 34, pal, **arm_kw)
    else:
        arm(sc, sk, sk.fa, 39 if raised(sk.fa) else 10, pal, far=True, **arm_kw)
        leg(sc, sk, sk.fl, 12, pal, far=True, **leg_kw)
        leg(sc, sk, sk.nl, 18, pal, **leg_kw)
        arm(sc, sk, sk.na, 44 if raised(sk.na) else 30, pal, **arm_kw)


def head_frame(sk: Skel, rig):
    """Map head-local points (authored at ~90 px radius) to the scene."""
    ang = sk.lean * 0.5 + sk.head_tilt
    return lambda pts: rot(pts, sk.head, ang, rig.head_k, rig.head_k)


def raised(joints) -> bool:
    """A hand above the shoulder draws over the head, like the Wraith's fist."""
    return joints[2][1] < joints[0][1] - 20
