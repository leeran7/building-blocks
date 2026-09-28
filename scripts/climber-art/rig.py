"""Low-poly 2D rig renderer for climber sprite sheets.

Characters are built from faceted polygons hung on a small skeleton
(pelvis, torso, head, two-bone arms and legs). Every pose is a set of joint
angles, so the costume never changes between frames: only the joints move.
Output follows app/public/climb/README.md: 512 px design cells with the foot
anchor at (256, 460) and a 380 px idle height, rendered supersampled and
downscaled to 192 px cells.

Geometry is in 512-cell units. Local frames use +x = forward (the facing
direction, image right) and -y = up. Angles are degrees measured from
straight down, positive toward +x, so dirv(0) points down, dirv(90) forward
and dirv(180) up.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFilter

CELL = 512
OUT = 192
SS = 2  # raster scale over the 512 design cell
ANCHOR = (256.0, 460.0)
REF_H = 380.0
LIGHT = (-0.55, -0.83)  # toward the light: upper left

Pt = tuple[float, float]


def hexc(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def mul(c, f: float):
    return tuple(max(0, min(255, int(round(v * f)))) for v in c[:3])


def mix(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def add(a: Pt, b: Pt) -> Pt:
    return (a[0] + b[0], a[1] + b[1])


def sub(a: Pt, b: Pt) -> Pt:
    return (a[0] - b[0], a[1] - b[1])


def scl(a: Pt, k: float) -> Pt:
    return (a[0] * k, a[1] * k)


def norm(a: Pt) -> Pt:
    d = math.hypot(a[0], a[1]) or 1.0
    return (a[0] / d, a[1] / d)


def rot(p: Pt, deg: float) -> Pt:
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


def dirv(deg: float) -> Pt:
    r = math.radians(deg)
    return (math.sin(r), math.cos(r))


def lerp(a: Pt, b: Pt, t: float) -> Pt:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def jitter(name: str, i: int, amp: float) -> float:
    h = hashlib.md5(f"{name}:{i}".encode()).digest()
    return (h[0] / 255.0 - 0.5) * 2 * amp


class Frame:
    """A local frame: origin, rotation (deg, + = lean forward), mirror sx, scale k, width w."""

    def __init__(self, origin: Pt, angle: float = 0.0, sx: float = 1.0, k: float = 1.0, w: float = 1.0):
        self.o, self.a, self.sx, self.k, self.w = origin, angle, sx, k, w

    def __call__(self, pts):
        return [add(self.o, rot((x * self.sx * self.k * self.w, y * self.k), self.a)) for x, y in pts]

    def p(self, x: float, y: float) -> Pt:
        return self([(x, y)])[0]


@dataclass
class Cmd:
    kind: str  # "facet" | "flat" | "glow"
    pts: list
    color: tuple
    name: str
    ow: float = 2.4
    strength: float = 0.42
    outline: tuple | None = None
    tags: tuple = ()
    radius: float = 0.0
    alpha: float = 1.0
    bulge: float = 0.07


@dataclass
class Scene:
    outline: tuple
    cmds: list = field(default_factory=list)
    marks: dict = field(default_factory=dict)

    def poly(self, pts, color, name, *, ow=2.4, strength=0.5, tags=(), outline=None, flat=False, bulge=0.07):
        self.cmds.append(
            Cmd("flat" if flat else "facet", list(pts), tuple(color), name, ow, strength,
                outline or self.outline, tuple(tags), bulge=0.0 if "ground" in tags else bulge)
        )

    def glow(self, center: Pt, radius: float, color, alpha: float = 0.8, name="glow"):
        self.cmds.append(Cmd("glow", [center], tuple(color), name, radius=radius, alpha=alpha))

    def mark(self, key: str, p: Pt):
        self.marks[key] = p

    # --- limb helpers -----------------------------------------------------
    def seg(self, a: Pt, b: Pt, wa: float, wb: float, color, name, *, cap=0.3, **kw):
        """A tapered hexagonal bone from a to b (widths wa, wb)."""
        d = norm(sub(b, a))
        n = (-d[1], d[0])
        pts = [
            sub(a, scl(d, wa * cap)),
            add(a, scl(n, wa / 2)),
            add(b, scl(n, wb / 2)),
            add(b, scl(d, wb * cap)),
            sub(b, scl(n, wb / 2)),
            sub(a, scl(n, wa / 2)),
        ]
        self.poly(pts, color, name, **kw)

    def curve(self, line, w0: float, w1: float, color, name, **kw):
        """A tapered ribbon along a polyline (horns, antennae, blades)."""
        n = len(line)
        left, right = [], []
        for i, p in enumerate(line):
            a = line[max(0, i - 1)]
            b = line[min(n - 1, i + 1)]
            d = norm(sub(b, a))
            nn = (-d[1], d[0])
            w = (w0 + (w1 - w0) * i / (n - 1)) / 2
            left.append(add(p, scl(nn, w)))
            right.append(sub(p, scl(nn, w)))
        self.poly(left + right[::-1], color, name, **kw)

    def gem(self, c: Pt, r: float, color, name, n=7, squash=1.0, angle=0.0, **kw):
        pts = [add(c, rot((r * math.cos(2 * math.pi * i / n), r * squash * math.sin(2 * math.pi * i / n)), angle))
               for i in range(n)]
        self.poly(pts, color, name, **kw)


def ik(root: Pt, target: Pt, l1: float, l2: float, bend: float) -> tuple[Pt, Pt]:
    """Two-bone IK: returns (joint, end). bend=+1/-1 picks the joint side."""
    d = sub(target, root)
    dist = max(1e-3, min(math.hypot(*d), l1 + l2 - 1e-3))
    a = math.acos(max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    base = math.atan2(d[1], d[0])
    ang = base + bend * a
    joint = add(root, (l1 * math.cos(ang), l1 * math.sin(ang)))
    end = add(root, scl(norm(d), dist))
    return joint, end


# --- rasteriser -------------------------------------------------------------


def _xf(p: Pt, k: float, shift: Pt) -> Pt:
    x = ANCHOR[0] + (p[0] - ANCHOR[0]) * k + shift[0]
    y = ANCHOR[1] + (p[1] - ANCHOR[1]) * k + shift[1]
    return (x * SS, y * SS)


def _bulge(P, amount: float):
    """Split long edges at a midpoint pushed outward: rounder plates, more facets."""
    if amount <= 0 or len(P) < 3:
        return P
    n = len(P)
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))
    sign = 1 if area > 0 else -1
    out = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        out.append(a)
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L > 44 * SS:
            e = norm(sub(b, a))
            nrm = (e[1] * sign, -e[0] * sign)
            out.append(add(lerp(a, b, 0.5), scl(nrm, L * amount)))
    return out


def _facet(draw: ImageDraw.ImageDraw, P, cmd: Cmd):
    P = _bulge(P, cmd.bulge)
    ow = cmd.ow * SS
    if ow > 0:
        draw.line(P + [P[0]], fill=cmd.outline + (255,), width=max(1, int(round(ow * 2))), joint="curve")
        draw.polygon(P, fill=cmd.outline + (255,))
    if cmd.kind == "flat":
        draw.polygon(P, fill=tuple(cmd.color) + (255,))
        return
    n = len(P)
    cx = sum(p[0] for p in P) / n
    cy = sum(p[1] for p in P) / n
    size = max(max(p[0] for p in P) - min(p[0] for p in P), max(p[1] for p in P) - min(p[1] for p in P))
    top = min(p[1] for p in P)
    span = max(1.0, max(p[1] for p in P) - top)

    def shade(f, tri):
        # a soft top-to-bottom falloff gives each plate some volume
        ty = (sum(q[1] for q in tri) / len(tri) - top) / span
        return mul(cmd.color, f * (1.1 - 0.2 * ty)) + (255,)

    c = (cx + LIGHT[0] * size * 0.08, cy + LIGHT[1] * size * 0.08)
    s = cmd.strength
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))
    sign = 1 if area > 0 else -1
    # Concentric rings: the outer band faces away from the centre (strong
    # light/dark by edge normal), inner bands flatten toward the top face.
    rings = [P] + [[lerp(c, p, r) for p in P] for r in ((0.68, 0.36) if size > 70 * SS else (0.5,))]
    for band in range(len(rings) - 1):
        outer, inner = rings[band], rings[band + 1]
        k = s * (1.0 if band == 0 else 0.55)
        for i in range(n):
            a, b = outer[i], outer[(i + 1) % n]
            qa, qb = inner[i], inner[(i + 1) % n]
            e = norm(sub(b, a))
            nrm = (e[1] * sign, -e[0] * sign)  # outward normal
            f = 1 + k * (nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1])
            seed = 20 * band + 2 * i
            draw.polygon([a, b, qb], fill=shade(f + jitter(cmd.name, seed, 0.06), [a, b, qb]))
            draw.polygon([a, qb, qa], fill=shade(f * 0.93 + jitter(cmd.name, seed + 1, 0.06), [a, qb, qa]))
    core = rings[-1]
    for i in range(n):
        tri = [c, core[i], core[(i + 1) % n]]
        draw.polygon(tri, fill=shade(1 + s * 0.3 + jitter(cmd.name, 99 + i, 0.035), tri))


def bounds(scene: Scene, tag: str | None = None):
    xs, ys = [], []
    for c in scene.cmds:
        if c.kind == "glow" or (tag and tag not in c.tags):
            continue
        for p in c.pts:
            xs.append(p[0])
            ys.append(p[1])
    return min(xs), min(ys), max(xs), max(ys)


def render(scene: Scene, k: float, shift: Pt) -> Image.Image:
    """Rasterise one 512 cell (supersampled), returning a 192 RGBA cell."""
    big = CELL * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    glows = []
    for cmd in scene.cmds:
        if cmd.kind == "glow":
            glows.append(cmd)
            continue
        P = [_xf(p, k, shift) for p in cmd.pts]
        _facet(draw, P, cmd)
    if glows:
        layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        gd = ImageDraw.Draw(layer)
        for g in glows:
            cx, cy = _xf(g.pts[0], k, shift)
            r = g.radius * k * SS
            gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=g.color + (int(255 * g.alpha),))
        layer = layer.filter(ImageFilter.GaussianBlur(radius=6 * SS))
        img = Image.alpha_composite(img, layer)
    small = img.convert("RGBa").resize((OUT, OUT), Image.LANCZOS).convert("RGBA")
    return small


def fit(idle: Scene) -> float:
    """One scale for every pose: the idle figure's head top sits REF_H above the anchor."""
    top = idle.marks["headTop"][1]
    ground = bounds(idle, "ground")[3]
    return REF_H / (ground - top)


def ground_shift(scene: Scene, k: float, lift: float = 0.0) -> Pt:
    """Vertical shift that puts the lowest grounded point on the anchor line."""
    low = bounds(scene, "ground")[3] + 3.0  # outline and edge bulge sit below the polygon
    return (0.0, ANCHOR[1] - (ANCHOR[1] + (low - ANCHOR[1]) * k) - lift)


def sheet(cells: list[Image.Image], cols: int) -> Image.Image:
    rows = (len(cells) + cols - 1) // cols
    out = Image.new("RGBA", (cols * OUT, rows * OUT), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.alpha_composite(c, ((i % cols) * OUT, (i // cols) * OUT))
    return out


def quantise(img: Image.Image, colors: int = 256) -> Image.Image:
    return img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
