"""Code-drawn low-poly climber rig.

Renders a chibi character to the climb art contract (app/public/climb/README.md):
a 4x2 poses atlas and a 6-frame back-view climb strip, 192 px cells, foot root
at (256, 460) of a 512 cell and a 380 px idle height, scaled to 192.

A character module supplies a palette and part painters (head, torso, limbs,
extras); this module owns the skeleton, the poses, faceted shading, outlines
and packing. Everything is deterministic: same code, same PNG bytes.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, replace

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import climb_cycle

PACK = 512  # pack cell, where the anchor is measured
ROOT = (256.0, 460.0)
REF_H = 380.0
SS = 3  # supersample factor while drawing
CELL = 192

LIGHT = (-0.55, -0.83)  # from the upper left


# ---------------------------------------------------------------- colour

def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def shade(c, k: float):
    """k > 1 lightens toward white, k < 1 darkens."""
    r, g, b = hexrgb(c) if isinstance(c, str) else c
    if k >= 1:
        t = min(1.0, k - 1)
        return tuple(int(v + (255 - v) * t) for v in (r, g, b))
    return tuple(max(0, int(v * k)) for v in (r, g, b))


def mix(a, b, t: float):
    a = hexrgb(a) if isinstance(a, str) else a
    b = hexrgb(b) if isinstance(b, str) else b
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


# ---------------------------------------------------------------- geometry

def rot(pts, o, ang, sx=1.0, sy=1.0):
    """Rotate local points by `ang` radians (clockwise on screen) and move to o."""
    c, s = math.cos(ang), math.sin(ang)
    return [(o[0] + x * sx * c - y * sy * s, o[1] + x * sx * s + y * sy * c) for x, y in pts]


def limb_end(o, length, deg):
    """End of a bone from o; deg 0 points down, +90 points right (forward)."""
    a = math.radians(deg)
    return (o[0] + length * math.sin(a), o[1] + length * math.cos(a))


def centroid(pts):
    ax = sum(p[0] for p in pts) / len(pts)
    ay = sum(p[1] for p in pts) / len(pts)
    return ax, ay


def ellipse_pts(cx, cy, rx, ry, n=10, start=0.0):
    return [(cx + rx * math.cos(start + 2 * math.pi * i / n), cy + ry * math.sin(start + 2 * math.pi * i / n)) for i in range(n)]


# ---------------------------------------------------------------- scene

@dataclass
class Shape:
    z: float
    pts: list
    color: tuple
    facet: bool = True
    edge: bool = True
    glow: bool = False


@dataclass
class Scene:
    seed: int
    shapes: list = field(default_factory=list)

    def poly(self, z, pts, color, facet=True, edge=True, glow=False):
        c = hexrgb(color) if isinstance(color, str) else color
        self.shapes.append(Shape(z, list(pts), c, facet, edge, glow))


def _facets(scene: Scene, shp: Shape, rnd: random.Random):
    """Split a polygon into lit triangles: an outer ring and an inner fan."""
    pts = shp.pts
    cx, cy = centroid(pts)
    # Pull the inner hub toward the light so the lit side has smaller facets.
    hub = (cx + LIGHT[0] * 0.0, cy + LIGHT[1] * 0.0)
    inner = [(hub[0] + (x - hub[0]) * 0.5 + rnd.uniform(-2, 2), hub[1] + (y - hub[1]) * 0.5 + rnd.uniform(-2, 2)) for x, y in pts]
    tris = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        ia, ib = inner[i], inner[(i + 1) % n]
        tris.append([a, b, ib])
        tris.append([a, ib, ia])
        tris.append([ia, ib, hub])
    out = []
    for t in tris:
        tx, ty = centroid(t)
        dx, dy = tx - cx, ty - cy
        d = math.hypot(dx, dy) or 1.0
        # Outer facets tilt away from the hub: light hits those facing the light.
        tilt = min(1.0, d / 40.0)
        lam = (dx / d * LIGHT[0] + dy / d * LIGHT[1]) * tilt
        k = 1.0 + 0.32 * lam + rnd.uniform(-0.06, 0.06)
        out.append((t, shade(shp.color, k)))
    return out


def render(scene: Scene, outline="#0d0a0c") -> Image.Image:
    """Rasterise a scene (pack px) to a PACK x PACK RGBA image."""
    W = PACK * SS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    gd = ImageDraw.Draw(glow)
    rnd = random.Random(scene.seed)
    ol = hexrgb(outline)
    for shp in sorted(scene.shapes, key=lambda s: s.z):
        sp = [(x * SS, y * SS) for x, y in shp.pts]
        if shp.facet and len(sp) >= 3:
            for tri, col in _facets(scene, replace(shp, pts=sp), rnd):
                d.polygon(tri, fill=col + (255,), outline=col + (255,))
        else:
            d.polygon(sp, fill=shp.color + (255,))
        if shp.edge:
            d.line(sp + [sp[0]], fill=ol + (255,), width=int(2.2 * SS), joint="curve")
        if shp.glow:
            gd.polygon(sp, fill=shp.color + (255,))
    # Silhouette outline: dilate the alpha and put a dark rim behind everything.
    a = img.getchannel("A")
    rim = a.filter(ImageFilter.MaxFilter(2 * int(2.5 * SS) + 1))
    base = Image.new("RGBA", (W, W), ol + (0,))
    base.putalpha(rim)
    base.alpha_composite(img)
    if glow.getbbox():
        halo = glow.filter(ImageFilter.GaussianBlur(5 * SS))
        ha = halo.getchannel("A").point(lambda v: int(v * 0.55))
        halo.putalpha(ImageChops.multiply(ha, rim.filter(ImageFilter.MaxFilter(9 * SS // 2 * 2 + 1))))
        base = Image.alpha_composite(base, halo)
    return base.resize((PACK, PACK), Image.LANCZOS)


# ---------------------------------------------------------------- skeleton

@dataclass
class Pose:
    """Joint angles in degrees (0 = limb straight down, + = toward facing)."""
    hip_dx: float = 0.0
    hip_dy: float = 0.0
    lean: float = 0.0  # torso, + leans forward
    head_tilt: float = 0.0
    # near (front, viewer side) and far limbs: upper and lower absolute angles
    na: tuple = (-12, -4)
    fa: tuple = (14, 8)
    nl: tuple = (-6, -2)
    fl: tuple = (8, 2)
    tail: float = 0.0  # tail sway, degrees
    wings: float = 0.0  # 0 folded, 1 spread
    squash: float = 1.0
    reach: float = 1.0  # arm stretch for overhead reaches (chibi exaggeration)
    back: bool = False  # back view (climb strip)


@dataclass
class Rig:
    """Bone lengths and joint spacing, pack px, before the global fit scale."""
    leg_hip_y: float = 96  # hip height above the root
    thigh: float = 48
    shin: float = 44
    torso: float = 100
    torso_w: float = 108
    upper_arm: float = 50
    fore_arm: float = 46
    shoulder_dx: tuple = (-26, 34)  # near, far from the neck
    hip_dx: tuple = (-18, 18)
    head_up: float = 64  # head centre above the neck
    head_dx: float = 10
    head_k: float = 0.8  # head drawing scale (parts are authored at ~90 px radius)
    back_shoulder: float = 56
    back_hip: float = 24


@dataclass
class Skel:
    hip: tuple
    neck: tuple
    head: tuple
    lean: float
    head_tilt: float
    # joints per limb: (root, mid, end)
    na: tuple
    fa: tuple
    nl: tuple
    fl: tuple
    pose: Pose


def skeleton(rig: Rig, p: Pose) -> Skel:
    hip = (ROOT[0] + p.hip_dx, ROOT[1] - rig.leg_hip_y * p.squash + p.hip_dy)
    lean = math.radians(p.lean)
    neck = rot([(0, -rig.torso * p.squash)], hip, lean)[0]
    hd = 0 if p.back else rig.head_dx
    head = rot([(hd, -rig.head_up)], neck, lean + math.radians(p.head_tilt) * 0.5)[0]

    def limb(root, a, l1, l2, stretch=1.0):
        m = limb_end(root, l1, a[0])
        e = limb_end(m, l2, a[1])
        if stretch != 1.0 and e[1] < root[1] - 20:  # only a raised arm stretches
            return limb(root, a, l1 * stretch, l2 * stretch)
        return (root, m, e)

    if p.back:
        sn, sf = -rig.back_shoulder, rig.back_shoulder
        hn, hf = -rig.back_hip, rig.back_hip
    else:
        sn, sf = rig.shoulder_dx
        hn, hf = rig.hip_dx
    sh_n = rot([(sn, 18)], neck, lean)[0]
    sh_f = rot([(sf, 18)], neck, lean)[0]
    hp_n = rot([(hn, -4)], hip, lean)[0]
    hp_f = rot([(hf, -4)], hip, lean)[0]
    return Skel(
        hip, neck, head, lean, math.radians(p.head_tilt),
        limb(sh_n, p.na, rig.upper_arm, rig.fore_arm, p.reach),
        limb(sh_f, p.fa, rig.upper_arm, rig.fore_arm, p.reach),
        limb(hp_n, p.nl, rig.thigh, rig.shin),
        limb(hp_f, p.fl, rig.thigh, rig.shin),
        p,
    )


def seg(a, b, w0, w1, bulge=0.0, n=3):
    """A tapered faceted segment from a to b (widths w0 -> w1)."""
    ang = math.atan2(b[0] - a[0], b[1] - a[1])  # angle from straight down
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    L, R = [], []
    for i in range(n + 1):
        t = i / n
        w = (w0 + (w1 - w0) * t) / 2 * (1 + bulge * math.sin(math.pi * t))
        L.append((-w, t * length))
        R.append((w, t * length))
    cap0 = [(0, -w0 * 0.35)]
    cap1 = [(0, length + w1 * 0.35)]
    local = cap0 + R + cap1 + L[::-1]
    return rot(local, a, -ang)


# ---------------------------------------------------------------- poses

def pose_set() -> dict[str, Pose]:
    """The eight atlas poses, facing right (three-quarter view)."""
    return {
        "idle": Pose(),
        "run_a": Pose(hip_dy=14, lean=8, na=(-48, -10), fa=(52, 110), nl=(38, 4), fl=(-40, -88), tail=-10),
        "run_b": Pose(hip_dy=7, lean=8, na=(50, 108), fa=(-44, -8), nl=(-42, -92), fl=(36, 2), tail=10),
        "reach_a": Pose(hip_dy=2, reach=1.5, na=(-168, -178), fa=(28, 12), nl=(-4, -2), fl=(42, -12), head_tilt=-10),
        "reach_b": Pose(hip_dy=2, reach=1.5, na=(-20, 20), fa=(150, 166), nl=(38, -14), fl=(4, 0), head_tilt=-10),
        "air": Pose(hip_dy=-26, lean=-4, na=(-118, -142), fa=(118, 140), nl=(-30, -6), fl=(36, 70), wings=1.0, tail=16),
        "done": Pose(hip_dy=1, reach=1.15, na=(-140, -162), fa=(138, 160), nl=(-14, -6), fl=(16, 6), head_tilt=-14, wings=0.6),
        "dead": Pose(hip_dy=36, lean=34, head_tilt=22, na=(38, 70), fa=(52, 88), nl=(84, -20), fl=(108, -6), squash=0.92, tail=-20),
    }


POSE_ORDER = ["idle", "run_a", "run_b", "reach_a", "reach_b", "air", "done", "dead"]


def climb_poses(rig: Rig) -> list[Pose]:
    """Six back-view frames of the shared hand-over-hand cycle (../climb_cycle.py)."""
    reach = 1.15
    hip = (ROOT[0], ROOT[1] - rig.leg_hip_y)
    neck_y = hip[1] - rig.torso
    out = []
    for i in range(climb_cycle.FRAMES):
        t = i / climb_cycle.FRAMES
        arms, legs = {}, {}
        for side, sgn in (("l", -1), ("r", 1)):
            sh = (ROOT[0] + sgn * rig.back_shoulder, neck_y + 18)
            drop, out_, _ = climb_cycle.hand(i, side)
            hand = (sh[0] + sgn * (16 + out_), neck_y - 108 + drop)
            el, hd, _ = climb_cycle.ik(sh, hand, rig.upper_arm * reach, rig.fore_arm * reach, -sgn)
            arms[side] = (climb_cycle.limb_deg(sh, el), climb_cycle.limb_deg(el, hd))
            hp = (ROOT[0] + sgn * rig.back_hip, hip[1] - 4)
            lift, _ = climb_cycle.foot(i, side)
            ankle = (hp[0] + sgn * 8, hp[1] + (rig.thigh + rig.shin) * 0.97 - lift)
            kn, an, _ = climb_cycle.ik(hp, ankle, rig.thigh, rig.shin, sgn)
            legs[side] = (climb_cycle.limb_deg(hp, kn), climb_cycle.limb_deg(kn, an))
        out.append(Pose(
            back=True,
            reach=reach,
            na=arms["l"],  # image-left arm
            fa=arms["r"],  # image-right arm
            nl=legs["l"],
            fl=legs["r"],
            tail=8 * math.sin(2 * math.pi * t),
        ))
    return out


# ---------------------------------------------------------------- packing

def fit_scale(draw_fn, rig: Rig) -> float:
    """Scale so the idle figure is REF_H tall from the root."""
    img = render(draw_fn(skeleton(rig, Pose()), 1.0))
    top = img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()[1]
    return REF_H / (ROOT[1] - top)


def scaled(scene: Scene, k: float) -> Scene:
    for s in scene.shapes:
        s.pts = [(ROOT[0] + (x - ROOT[0]) * k, ROOT[1] + (y - ROOT[1]) * k) for x, y in s.pts]
    return scene


def build(draw_fn, rig: Rig):
    """Return (poses 768x384, climb 1152x192, the 512 cells for previews)."""
    k = fit_scale(draw_fn, rig)
    cells = {}
    for name, p in pose_set().items():
        cells[name] = render(scaled(draw_fn(skeleton(rig, p), 1.0), k))
    climb = [render(scaled(draw_fn(skeleton(rig, p), 1.0), k)) for p in climb_poses(rig)]
    poses = Image.new("RGBA", (CELL * 4, CELL * 2), (0, 0, 0, 0))
    for i, name in enumerate(POSE_ORDER):
        poses.paste(cells[name].resize((CELL, CELL), Image.LANCZOS), ((i % 4) * CELL, (i // 4) * CELL))
    strip = Image.new("RGBA", (CELL * 6, CELL), (0, 0, 0, 0))
    for i, c in enumerate(climb):
        strip.paste(c.resize((CELL, CELL), Image.LANCZOS), (i * CELL, 0))
    return poses, strip, cells, climb


def quantise(img: Image.Image, colors=160) -> Image.Image:
    """Palette-quantise keeping alpha, like the shipped Wraith sheets."""
    return img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
