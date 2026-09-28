"""
Low-poly climber rig: draws a chibi character into the climber sprite contract
(app/public/climb/README.md) from code, so a character's sheets can be
re-rendered instead of generated.

Coordinates are the art pack's 512 px cell (foot anchor (256, 460), idle
height 380), rendered SS times larger and downscaled to 192 px cells.

A character supplies a palette, body proportions and head/tail drawers; the
rig supplies the skeleton (two-bone IK limbs), faceted shading, the eight
poses and the six-frame back-view climb cycle.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, replace
from typing import Callable

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import climb_cycle

PACK = 512
SS = 3  # render pixels per pack pixel
OUT = 192

Vec = tuple[float, float]
RGB = tuple[int, int, int]

LIGHT = (-0.45, -0.7, 0.55)
_ln = math.sqrt(sum(c * c for c in LIGHT))
LIGHT = tuple(c / _ln for c in LIGHT)
OUTLINE: RGB = (16, 14, 20)


def hexrgb(h: str) -> RGB:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def mul(c: RGB, k: float) -> RGB:
    return tuple(max(0, min(255, int(round(v * k)))) for v in c)  # type: ignore[return-value]


def mix(a: RGB, b: RGB, t: float) -> RGB:
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))  # type: ignore[return-value]


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1])


def sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1])


def scl(a: Vec, k: float) -> Vec:
    return (a[0] * k, a[1] * k)


def length(a: Vec) -> float:
    return math.hypot(a[0], a[1])


def norm(a: Vec) -> Vec:
    n = length(a) or 1.0
    return (a[0] / n, a[1] / n)


def rot(a: Vec, ang: float) -> Vec:
    c, s = math.cos(ang), math.sin(ang)
    return (a[0] * c - a[1] * s, a[0] * s + a[1] * c)


def lerp(a: Vec, b: Vec, t: float) -> Vec:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def ik(root: Vec, target: Vec, l1: float, l2: float, hint: Vec) -> tuple[Vec, Vec]:
    """Two-bone IK: (joint, end). The joint bends toward `hint`."""
    d = sub(target, root)
    dist = length(d)
    dist = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-3, dist))
    base = math.atan2(d[1], d[0])
    cosa = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    alpha = math.acos(max(-1.0, min(1.0, cosa)))
    best = None
    for sgn in (1, -1):
        j = add(root, (l1 * math.cos(base + sgn * alpha), l1 * math.sin(base + sgn * alpha)))
        score = (j[0] - root[0]) * hint[0] + (j[1] - root[1]) * hint[1]
        if best is None or score > best[0]:
            best = (score, j)
    joint = best[1]
    end = add(root, (dist * math.cos(base), dist * math.sin(base)))
    return joint, end


class Canvas:
    """One cell being rendered, plus a glow layer drawn on top at the end."""

    def __init__(self, seed: int):
        self.im = Image.new("RGBA", (PACK * SS, PACK * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im, "RGBA")
        self.glow = Image.new("RGBA", self.im.size, (0, 0, 0, 0))
        self.gd = ImageDraw.Draw(self.glow, "RGBA")
        self.top = Image.new("RGBA", self.im.size, (0, 0, 0, 0))
        self.td = ImageDraw.Draw(self.top, "RGBA")
        self.seed = seed

    @staticmethod
    def P(pts: list[Vec]) -> list[Vec]:
        return [(x * SS, y * SS) for x, y in pts]

    def flat(self, pts: list[Vec], col: RGB, alpha: int = 255) -> None:
        self.d.polygon(self.P(pts), fill=col + (alpha,))

    def facet(
        self,
        pts: list[Vec],
        col: RGB,
        key: str,
        ring: float = 0.55,
        jit: float = 0.07,
        amb: float = 0.52,
        dif: float = 0.62,
        center: Vec | None = None,
    ) -> None:
        """Low-poly fill: an outer ring of facets and an inner fan, each shaded
        by a pseudo-dome normal against the key light plus a seeded jitter."""
        n = len(pts)
        if n < 3:
            return
        rng = random.Random(f"{self.seed}:{key}")
        c = center or (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
        R = max(length(sub(p, c)) for p in pts) or 1.0
        inner = [lerp(c, p, ring) for p in pts]
        tris: list[list[Vec]] = []
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            ia, ib = inner[i], inner[(i + 1) % n]
            tris.append([a, b, ib])
            tris.append([a, ib, ia])
            tris.append([c, ia, ib])
        self.flat(pts, mul(col, amb + dif * 0.35))
        for t in tris:
            tc = ((t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3)
            dx, dy = (tc[0] - c[0]) / R, (tc[1] - c[1]) / R
            r2 = min(0.88, dx * dx + dy * dy)
            nz = math.sqrt(1 - r2)
            ndl = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]
            k = amb + dif * max(0.0, ndl) + rng.uniform(-jit, jit)
            self.d.polygon(self.P(t), fill=mul(col, k) + (255,))

    def line(self, a: Vec, b: Vec, col: RGB, w: float, alpha: int = 255, top: bool = False) -> None:
        (self.td if top else self.d).line(self.P([a, b]), fill=col + (alpha,), width=max(1, int(w * SS)))

    def eye(self, c: Vec, rx: float, ry: float, ang: float, col: RGB) -> None:
        """Glowing almond eye: halo on the glow layer, bright core on top."""
        pts = []
        for i in range(12):
            t = 2 * math.pi * i / 12
            p = (rx * math.cos(t), ry * math.sin(t) * (1.0 if math.sin(t) > 0 else 0.8))
            pts.append(add(c, rot(p, ang)))
        halo = [add(c, rot((rx * 1.8 * math.cos(2 * math.pi * i / 16), ry * 2.2 * math.sin(2 * math.pi * i / 16)), ang)) for i in range(16)]
        self.gd.polygon(self.P(halo), fill=col + (80,))
        self.td.polygon(self.P(pts), fill=mix(col, (255, 255, 255), 0.35) + (255,))
        core = [add(c, scl(sub(p, c), 0.45)) for p in pts]
        self.td.polygon(self.P(core), fill=(255, 255, 255, 255))

    def finish(self) -> Image.Image:
        """Outline the silhouette, add the glow, downscale to a 192 cell."""
        base = self.im
        base.alpha_composite(self.top)
        a = base.getchannel("A").point(lambda v: 255 if v > 40 else 0)
        grown = a.filter(ImageFilter.MaxFilter(2 * SS + 1))
        outline = Image.new("RGBA", base.size, OUTLINE + (0,))
        outline.putalpha(grown)
        outline.alpha_composite(base)
        glow = self.glow.filter(ImageFilter.GaussianBlur(3 * SS))
        # Glow brightens the figure but only lightly tints empty space.
        ga = glow.getchannel("A")
        inside = ImageChops.multiply(ga, grown)
        outside = ga.point(lambda v: int(v * 0.35))
        glow.putalpha(ImageChops.lighter(inside, outside))
        outline.alpha_composite(glow)
        return outline.resize((OUT, OUT), Image.LANCZOS)


@dataclass
class Palette:
    body: RGB  # main armour
    dark: RGB  # far limbs, joints
    light: RGB  # highlights, muzzles
    accent: RGB
    accent_dark: RGB
    eye: RGB
    boot: RGB
    extra: dict[str, RGB] = field(default_factory=dict)


@dataclass
class Body:
    thigh: float = 44
    shin: float = 42
    upper: float = 52
    fore: float = 50
    limb_w: float = 20  # half-width at the root
    leg_w: float = 21
    torso_len: float = 92
    shoulder_w: float = 48
    waist_w: float = 44
    chest_w: float = 60
    pad: float = 36  # pauldron radius
    hand: float = 18
    boot_len: float = 44
    head_k: float = 0.82  # head drawing scale
    head_up: float = 74  # head centre above the neck


@dataclass
class Pose:
    pelvis: Vec
    lean: float  # radians, + leans toward facing
    near_hand: Vec
    far_hand: Vec
    near_foot: Vec  # ankle
    far_foot: Vec
    head_tilt: float = 0.0
    head_off: Vec = (0.0, 0.0)
    near_boot: float = 0.0  # boot rotation (radians)
    far_boot: float = 0.0
    elbow_hint_near: Vec = (-0.6, 1.0)
    elbow_hint_far: Vec = (-0.6, 1.0)
    fists: str = "fist"  # or "open"
    tail: float = 0.0  # tail swing


@dataclass
class Character:
    id: str
    pal: Palette
    body: Body
    head: Callable[["Canvas", Vec, float, str, Palette, Body, "Pose"], None]
    tail: Callable[["Canvas", Vec, float, str, Palette, "Pose"], None] | None = None
    torso: Callable[["Canvas", "Frame", str, Palette, Body], None] | None = None
    pauldron: Callable[["Canvas", Vec, float, bool, str, Palette, Body], None] | None = None
    boot: Callable[["Canvas", Vec, float, bool, str, Palette, Body], None] | None = None
    leg_col: RGB | None = None


@dataclass
class Frame:
    pelvis: Vec
    neck: Vec
    lean: float
    near_sh: Vec
    far_sh: Vec
    near_hip: Vec
    far_hip: Vec


def limb(
    cv: Canvas,
    a: Vec,
    j: Vec,
    e: Vec,
    w0: float,
    w1: float,
    w2: float,
    col: RGB,
    joint_col: RGB,
    key: str,
    fore_col: RGB | None = None,
) -> None:
    """Two tapered faceted segments with a pad at the joint."""
    for p, q, wa, wb, k in ((a, j, w0, w1, "u"), (j, e, w1, w2, "l")):
        seg_col = fore_col if (k == "l" and fore_col) else col
        d = norm(sub(q, p))
        n = (-d[1], d[0])
        mid = lerp(p, q, 0.5)
        bulge = (wa + wb) / 2 * 1.12
        pts = [
            add(p, scl(n, wa)),
            add(mid, scl(n, bulge)),
            add(q, scl(n, wb)),
            add(q, scl(d, wb * 0.5)),
            add(q, scl(n, -wb)),
            add(mid, scl(n, -bulge)),
            add(p, scl(n, -wa)),
            add(p, scl(d, -wa * 0.5)),
        ]
        cv.facet(pts, seg_col, key + k, ring=0.45)
    pad = [add(j, rot((w1 * 1.25, 0), math.pi * 2 * i / 6 + 0.3)) for i in range(6)]
    cv.facet(pad, joint_col, key + "j", ring=0.4)


def fist(cv: Canvas, c: Vec, r: float, ang: float, col: RGB, key: str, open_: bool = False) -> None:
    if open_:
        pts = []
        for i in range(10):
            t = ang - 1.2 + 2.4 * i / 9
            rr = r * (1.6 if i % 2 == 0 else 0.95)
            pts.append(add(c, (rr * math.cos(t), rr * math.sin(t))))
        pts += [add(c, rot((-r * 0.8, r * 0.7), ang)), add(c, rot((-r * 0.8, -r * 0.7), ang))]
        cv.facet(pts, col, key, ring=0.5)
        return
    pts = [add(c, rot((r * math.cos(t), r * 0.92 * math.sin(t)), ang)) for t in [2 * math.pi * i / 7 + 0.2 for i in range(7)]]
    cv.facet(pts, col, key, ring=0.5)


def default_boot(cv: Canvas, ankle: Vec, ang: float, side: bool, key: str, pal: Palette, b: Body) -> None:
    L = b.boot_len
    pts = [(-L * 0.42, -14), (L * 0.2, -16), (L * 0.62, -2), (L * 0.66, 18), (-L * 0.45, 19), (-L * 0.5, 2)]
    if not side:  # back view: heel toward the viewer
        pts = [(-L * 0.36, -14), (L * 0.36, -14), (L * 0.42, 18), (-L * 0.42, 18)]
    cv.facet([add(ankle, rot(p, ang)) for p in pts], pal.boot, key, ring=0.5)


def default_pauldron(cv: Canvas, sh: Vec, lean: float, near: bool, key: str, pal: Palette, b: Body) -> None:
    r = b.pad * (1.0 if near else 0.85)
    pts = [add(sh, rot((r * math.cos(t), r * 0.8 * math.sin(t)), lean)) for t in [math.pi * (0.95 + 1.1 * i / 6) for i in range(7)]]
    pts.append(add(sh, rot((r * 0.9, r * 0.35), lean)))
    pts.append(add(sh, rot((-r * 0.9, r * 0.45), lean)))
    cv.facet(pts, pal.accent if near else mul(pal.accent, 0.8), key, ring=0.5)


def frame_of(pose: Pose, b: Body, view: str) -> Frame:
    up = (math.sin(pose.lean), -math.cos(pose.lean))
    across = (math.cos(pose.lean), math.sin(pose.lean))
    neck = add(pose.pelvis, scl(up, b.torso_len))
    if view == "side":
        near_sh = add(add(neck, scl(across, -b.shoulder_w * 0.95)), scl(up, -14))
        far_sh = add(add(neck, scl(across, b.shoulder_w * 0.8)), scl(up, -10))
        near_hip = add(pose.pelvis, scl(across, -16))
        far_hip = add(pose.pelvis, scl(across, 18))
    else:
        near_sh = add(add(neck, scl(across, -b.shoulder_w)), scl(up, -12))
        far_sh = add(add(neck, scl(across, b.shoulder_w)), scl(up, -12))
        near_hip = add(pose.pelvis, scl(across, -20))
        far_hip = add(pose.pelvis, scl(across, 20))
    return Frame(pose.pelvis, neck, pose.lean, near_sh, far_sh, near_hip, far_hip)


def default_torso(cv: Canvas, f: Frame, view: str, pal: Palette, b: Body) -> None:
    def T(pts: list[Vec]) -> list[Vec]:
        return [add(f.pelvis, rot(p, f.lean)) for p in pts]

    L, cw, ww = b.torso_len, b.chest_w, b.waist_w
    torso = [(-ww, 4), (ww, 4), (cw * 0.95, -L * 0.55), (cw * 0.85, -L * 1.02), (-cw * 0.85, -L * 1.02), (-cw * 1.0, -L * 0.55)]
    cv.facet(T(torso), pal.body, "torso", ring=0.5)
    off = 6 if view == "side" else 0
    chev = [(-cw * 0.8 + off, -L * 0.86), (off, -L * 0.52), (cw * 0.8 + off, -L * 0.86), (cw * 0.8 + off, -L * 0.7), (off, -L * 0.34), (-cw * 0.8 + off, -L * 0.7)]
    cv.facet(T(chev), pal.accent, "chev", ring=0.5, jit=0.05)
    belt = [(-ww * 1.05, -8), (ww * 1.05, -8), (ww * 1.1, 10), (-ww * 1.1, 10)]
    cv.facet(T(belt), pal.dark, "belt", ring=0.5)
    plate = [(-ww * 0.95, 8), (-4, 8), (-10, 34), (-ww * 0.8, 30)]
    cv.facet(T(plate), mul(pal.accent, 0.85), "plateL", ring=0.5)
    plate2 = [(4, 8), (ww * 0.95, 8), (ww * 0.8, 30), (10, 34)]
    cv.facet(T(plate2), pal.body, "plateR", ring=0.5)


def draw(ch: Character, pose: Pose, view: str, seed: int) -> Image.Image:
    cv = Canvas(seed)
    b, pal = ch.body, ch.pal
    f = frame_of(pose, b, view)
    side = view == "side"
    torso = ch.torso or default_torso
    pauldron = ch.pauldron or default_pauldron
    boot = ch.boot or default_boot
    leg_col = ch.leg_col or pal.body
    up = (math.sin(pose.lean), -math.cos(pose.lean))
    head_c = add(add(f.neck, scl(up, b.head_up)), pose.head_off)

    def arm(near: bool) -> None:
        sh = f.near_sh if near else f.far_sh
        tgt = pose.near_hand if near else pose.far_hand
        hint = pose.elbow_hint_near if near else pose.elbow_hint_far
        raise_ = max(0.0, min(1.0, (sh[1] - tgt[1]) / 100))
        sh = (sh[0], sh[1] - 14 * raise_)
        j, e = ik(sh, tgt, b.upper, b.fore, hint)
        dim = 1.0 if (near or not side) else 0.72
        k = "an" if near else "af"
        limb(cv, sh, j, e, b.limb_w, b.limb_w * 0.8, b.limb_w * 0.72, mul(pal.body, dim), mul(pal.accent, dim * 0.95), k,
             fore_col=mul(pal.accent_dark, dim * 1.1))
        ang = math.atan2(e[1] - j[1], e[0] - j[0])
        fist(cv, add(e, scl(norm(sub(e, j)), b.hand * 0.6)), b.hand, ang, mul(mix(pal.dark, pal.light, 0.3), dim), k + "h", pose.fists == "open")
        pauldron(cv, sh, f.lean, near or not side, k + "p", pal, b if side else replace(b, pad=b.pad * 0.72))

    def leg(near: bool) -> None:
        hip = f.near_hip if near else f.far_hip
        tgt = pose.near_foot if near else pose.far_foot
        hint = (1.0, -0.2) if side else ((-1.0, 0.0) if near else (1.0, 0.0))
        j, e = ik(hip, tgt, b.thigh, b.shin, hint)
        dim = 1.0 if (near or not side) else 0.72
        k = "ln" if near else "lf"
        limb(cv, hip, j, e, b.leg_w, b.leg_w * 0.85, b.leg_w * 0.8, mul(leg_col, dim), mul(pal.accent, dim * 0.9), k)
        boot(cv, e, pose.near_boot if near else pose.far_boot, side, k + "b", replace(pal, boot=mul(pal.boot, dim)), b)

    if side:
        arm(False)
        leg(False)
        if ch.tail:
            ch.tail(cv, add(f.pelvis, rot((-34, -6), f.lean)), f.lean, view, pal, pose)
        torso(cv, f, view, pal, b)
        leg(True)
        ch.head(cv, head_c, pose.head_tilt, view, pal, b, pose)
        arm(True)
    else:
        leg(True)
        leg(False)
        torso(cv, f, view, pal, b)
        ch.head(cv, head_c, pose.head_tilt, view, pal, b, pose)
        arm(True)
        arm(False)
        if ch.tail:
            ch.tail(cv, add(f.pelvis, rot((0, 4), f.lean)), f.lean, view, pal, pose)
    return cv.finish()


# --- Poses -----------------------------------------------------------------

GROUND = 440  # ankle height of a planted foot (boot sole reaches ~460)


def poses_for(b: Body) -> list[Pose]:
    """Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down."""
    py = 352
    return [
        Pose((256, py), 0.0, (212, 344), (300, 340), (236, GROUND), (280, GROUND), head_tilt=0.0),
        Pose((256, py - 8), 0.13, (190, 316), (340, 298), (194, 406), (318, GROUND), head_tilt=0.05,
             near_boot=-0.5, far_boot=0.0, elbow_hint_near=(0.6, 1.0), elbow_hint_far=(-1.0, 0.4)),
        Pose((256, py - 8), 0.13, (328, 312), (206, 316), (314, GROUND), (192, 404), head_tilt=0.05,
             near_boot=0.0, far_boot=-0.5, elbow_hint_near=(-1.0, 0.4), elbow_hint_far=(0.6, 1.0)),
        Pose((256, py), -0.02, (192, 124), (300, 340), (238, GROUND), (284, 428), head_tilt=-0.08,
             elbow_hint_near=(-1.0, 0.0), far_boot=0.1),
        Pose((256, py), 0.02, (212, 344), (338, 128), (234, 428), (280, GROUND), head_tilt=-0.08,
             elbow_hint_far=(1.0, 0.0), near_boot=0.1),
        Pose((256, py - 26), -0.05, (166, 236), (352, 226), (200, 410), (318, 404), head_tilt=-0.12,
             near_boot=0.35, far_boot=-0.35, elbow_hint_near=(-0.3, 1.0), elbow_hint_far=(0.3, 1.0), fists="open"),
        Pose((256, py - 4), 0.0, (176, 170), (340, 160), (228, GROUND), (288, GROUND), head_tilt=-0.1,
             elbow_hint_near=(-1.0, 0.0), elbow_hint_far=(1.0, 0.0)),
        Pose((262, 414), 0.62, (306, 452), (340, 450), (216, 446), (262, 448), head_tilt=0.35, head_off=(10, 14),
             near_boot=0.0, elbow_hint_near=(-1.0, -0.2), elbow_hint_far=(-1.0, -0.2), tail=0.4),
    ]


def climb_for(b: Body) -> list[Pose]:
    """Back view, the shared hand-over-hand cycle (tools/climber-art/climb_cycle.py)."""
    out = []
    for i in range(climb_cycle.FRAMES):
        t = i / climb_cycle.FRAMES
        (rd, ro, _), (ld, lo, _) = climb_cycle.hand(i, "r"), climb_cycle.hand(i, "l")
        right_hand = (344 + ro, 110 + rd)
        left_hand = (168 - lo, 110 + ld)
        left_foot = (230, GROUND - climb_cycle.foot(i, "l")[0])
        right_foot = (282, GROUND - climb_cycle.foot(i, "r")[0])
        out.append(Pose((256, 352), 0.0, left_hand, right_hand, left_foot, right_foot,
                        elbow_hint_near=(-1.0, 0.3), elbow_hint_far=(1.0, 0.3), tail=math.sin(2 * math.pi * t)))
    return out


def render(ch: Character) -> tuple[Image.Image, Image.Image]:
    poses = Image.new("RGBA", (OUT * 4, OUT * 2), (0, 0, 0, 0))
    for i, p in enumerate(poses_for(ch.body)):
        poses.alpha_composite(draw(ch, p, "side", 7), ((i % 4) * OUT, (i // 4) * OUT))
    climb = Image.new("RGBA", (OUT * 6, OUT), (0, 0, 0, 0))
    for i, p in enumerate(climb_for(ch.body)):
        climb.alpha_composite(draw(ch, p, "back", 11), (i * OUT, 0))
    return poses, climb
