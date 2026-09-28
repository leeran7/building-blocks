"""
Low-poly rig renderer for climber sprites.

Characters are built from rigid parts (polygons in bone-local space) on a
two-bone-IK skeleton. Each part is cut into triangular facets once, in its
own local space, so the facets stay identical from frame to frame and only
the lighting follows the bone's rotation. Frames are drawn at SS× the 512 px
pack cell, then downsampled to the shipped 192 px cell.

Contract (app/public/climb/README.md): 512 cell, foot anchor (256, 460), idle
figure 380 px tall, faces right, transparent background.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy.spatial import Delaunay

CELL = 512
SS = 2  # supersample factor for drawing
OUT = 192
ANCHOR = (256.0, 460.0)
LIGHT = np.array([-0.45, -0.75, 0.55])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

Vec = tuple[float, float]


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=float)


def rot(p: Vec, a: float) -> Vec:
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1])


def sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1])


def lerp(a: Vec, b: Vec, t: float) -> Vec:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def ellipse(cx: float, cy: float, rx: float, ry: float, n: int = 12, phase: float = 0.0, wobble: float = 0.0, seed: int = 0) -> list[Vec]:
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        k = 1 + (rnd.uniform(-wobble, wobble) if wobble else 0)
        pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)))
    return pts


def capsule(length: float, w0: float, w1: float, n_end: int = 3) -> list[Vec]:
    """A tapered limb along +y from (0,0) to (0,length), faceted round ends."""
    pts: list[Vec] = []
    r0, r1 = w0 / 2, w1 / 2
    for i in range(n_end + 1):  # far end, left→right across the bottom
        a = math.pi - math.pi * i / n_end
        pts.append((r1 * math.cos(a), length + r1 * 0.8 * math.sin(a)))
    for i in range(n_end + 1):  # near end, right→left across the top
        a = -math.pi * i / n_end
        pts.append((r0 * math.cos(a), r0 * 0.8 * math.sin(a)))
    return pts


def _inside(poly: np.ndarray, pts: np.ndarray) -> np.ndarray:
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), dtype=bool)
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        cross = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        inside ^= cross
        j = i
    return inside


def _resample(poly: list[Vec], step: float) -> list[Vec]:
    out: list[Vec] = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        d = math.dist(a, b)
        k = max(1, int(d / step))
        for j in range(k):
            out.append(lerp(a, b, j / k))
    return out


@dataclass
class Facets:
    outline: np.ndarray  # (n,2) local
    tris: np.ndarray  # (m,3,2) local
    normals: np.ndarray  # (m,3) local
    center: Vec


_facet_cache: dict[tuple, Facets] = {}


def facetize(poly: list[Vec], step: float = 26.0, seed: int = 1, bulge: float = 1.0, center: Vec | None = None, radii: Vec | None = None, rough: float = 0.35) -> Facets:
    key = (tuple((round(p[0], 2), round(p[1], 2)) for p in poly), step, seed, bulge, center, radii, rough)
    if key in _facet_cache:
        return _facet_cache[key]
    rnd = np.random.default_rng(seed)
    P = np.array(poly, dtype=float)
    lo, hi = P.min(0), P.max(0)
    edge = np.array(_resample(poly, step * 0.9))
    gx = np.arange(lo[0] + step * 0.5, hi[0], step)
    gy = np.arange(lo[1] + step * 0.5, hi[1], step * 0.87)
    grid = []
    for r, y in enumerate(gy):
        for x in gx:
            grid.append((x + (step * 0.5 if r % 2 else 0), y))
    grid = np.array(grid) if grid else np.zeros((0, 2))
    if len(grid):
        grid = grid + rnd.uniform(-step * 0.3, step * 0.3, grid.shape)
        grid = grid[_inside(P, grid)]
        # keep interior points off the edge so edge facets aren't slivers
        if len(grid):
            d = np.min(np.linalg.norm(grid[:, None, :] - edge[None, :, :], axis=2), axis=1)
            grid = grid[d > step * 0.45]
    pts = np.vstack([edge, grid]) if len(grid) else edge
    if len(pts) < 3:
        pts = P
    tri = Delaunay(pts)
    T = pts[tri.simplices]
    cen = T.mean(1)
    T = T[_inside(P, cen)]
    c = np.array(center if center is not None else P.mean(0))
    rr = np.array(radii if radii is not None else (hi - lo) / 2 + 1e-6)
    cen = T.mean(1)
    nxy = (cen - c) / rr * 0.9 * bulge
    nxy += rnd.uniform(-rough, rough, nxy.shape)
    l2 = np.clip((nxy**2).sum(1), 0, 0.92)
    nxy = nxy / np.maximum(1, np.sqrt((nxy**2).sum(1) / 0.92))[:, None]
    nz = np.sqrt(np.clip(1 - (nxy**2).sum(1), 0.05, 1))
    N = np.column_stack([nxy, nz])
    N /= np.linalg.norm(N, axis=1)[:, None]
    f = Facets(P, T, N, tuple(c))
    _facet_cache[key] = f
    return f


@dataclass
class Style:
    base: np.ndarray
    ambient: float = 0.38
    diffuse: float = 0.78
    spec: float = 0.10
    glow: bool = False


def shade(style: Style, n: np.ndarray, dim: float) -> tuple[int, int, int]:
    d = max(0.0, float(n @ LIGHT))
    k = style.ambient + style.diffuse * d
    col = style.base * k * dim + 255 * style.spec * (d**6)
    col = np.clip(col, 0, 255)
    return tuple(int(v) for v in col)


@dataclass
class Piece:
    """A faceted polygon placed by a transform (origin, angle, flip)."""

    facets: Facets
    style: Style
    origin: Vec
    angle: float
    dim: float = 1.0
    z: float = 0.0
    edge: float = 0.55  # outline darkness multiplier (1 = none)
    sx: float = 1.0  # horizontal scale in local space (for back views)


class Scene:
    def __init__(self) -> None:
        self.pieces: list[Piece] = []
        self.glows: list[tuple[list[Vec], tuple[int, int, int], float]] = []
        self.lines: list[tuple[list[Vec], tuple[int, int, int, int], float, float]] = []

    def add(self, facets: Facets, style: Style, origin: Vec, angle: float, z: float, dim: float = 1.0, edge: float = 0.55, sx: float = 1.0) -> None:
        self.pieces.append(Piece(facets, style, origin, angle, dim, z, edge, sx))

    def glow(self, pts: list[Vec], color: str, radius: float) -> None:
        self.glows.append((pts, tuple(int(v) for v in hex_rgb(color)), radius))

    def line(self, pts: list[Vec], rgba: tuple[int, int, int, int], width: float, z: float) -> None:
        self.lines.append((pts, rgba, width, z))

    def render(self) -> Image.Image:
        S = SS
        img = Image.new("RGBA", (CELL * S, CELL * S), (0, 0, 0, 0))
        dr = ImageDraw.Draw(img)

        def tf(p: Piece, pts: np.ndarray) -> list[Vec]:
            c, s = math.cos(p.angle), math.sin(p.angle)
            x = pts[..., 0] * p.sx
            y = pts[..., 1]
            wx = x * c - y * s + p.origin[0]
            wy = x * s + y * c + p.origin[1]
            return list(zip((wx * S).tolist(), (wy * S).tolist()))

        items: list[tuple[float, int, object]] = [(p.z, 0, p) for p in self.pieces]
        items += [(ln[3], 1, ln) for ln in self.lines]
        items.sort(key=lambda t: (t[0], t[1]))
        for _, kind, obj in items:
            if kind == 1:
                pts, rgba, width, _ = obj  # type: ignore[misc]
                dr.line([(x * S, y * S) for x, y in pts], fill=rgba, width=max(1, int(width * S)), joint="curve")
                continue
            p: Piece = obj  # type: ignore[assignment]
            outline = tf(p, p.facets.outline)
            ec = tuple(int(v) for v in np.clip(p.style.base * 0.30 * p.dim * p.edge, 0, 255))
            dr.polygon(outline, fill=ec + (255,))
            c, s = math.cos(p.angle), math.sin(p.angle)
            for tri, n in zip(p.facets.tris, p.facets.normals):
                nx, ny = n[0] * (1 if p.sx > 0 else -1), n[1]
                wn = np.array([nx * c - ny * s, nx * s + ny * c, n[2]])
                col = shade(p.style, wn, p.dim)
                dr.polygon(tf(p, tri), fill=col + (255,))
            dr.line(outline + [outline[0]], fill=ec + (255,), width=max(1, int(2.2 * S)), joint="curve")

        # silhouette rim: a thin near-black outline so the figure reads on lava
        a = img.getchannel("A")
        rim = a.filter(ImageFilter.MaxFilter(2 * S + 1))
        base = Image.new("RGBA", img.size, (10, 8, 12, 0))
        base.putalpha(rim)
        base.alpha_composite(img)
        img = base

        # emissive glows (eyes): a soft additive halo plus the hot core
        for pts, col, radius in self.glows:
            m = Image.new("L", img.size, 0)
            ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in pts], fill=255)
            halo = m.filter(ImageFilter.GaussianBlur(radius * S))
            layer = Image.new("RGB", img.size, col)
            lit = ImageChops.multiply(layer, Image.merge("RGB", (halo, halo, halo)))
            rgb = ImageChops.add(img.convert("RGB"), lit)
            alpha = ImageChops.lighter(img.getchannel("A"), halo.point(lambda v: min(255, v * 2)))
            img = Image.merge("RGBA", (*rgb.split(), alpha))
            core = Image.new("RGBA", img.size, tuple(min(255, int(v * 0.55 + 125)) for v in col) + (255,))
            img.paste(core, (0, 0), m)
        return img


def to_cell(img: Image.Image, size: int = OUT) -> Image.Image:
    pm = img.convert("RGBa").resize((size, size), Image.Resampling.LANCZOS)
    return pm.convert("RGBA")


def ik(root: Vec, target: Vec, l1: float, l2: float, bend: float) -> tuple[Vec, Vec]:
    """Two-bone IK. bend=+1 puts the joint to the right of root→target."""
    dx, dy = sub(target, root)
    d = math.hypot(dx, dy)
    d = min(max(d, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    base = math.atan2(dy, dx)
    cos_a = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    a = math.acos(max(-1, min(1, cos_a)))
    ang = base - bend * a
    joint = (root[0] + l1 * math.cos(ang), root[1] + l1 * math.sin(ang))
    end_ang = math.atan2(target[1] - joint[1], target[0] - joint[0])
    end = (joint[0] + l2 * math.cos(end_ang), joint[1] + l2 * math.sin(end_ang))
    return joint, end


def bone_angle(a: Vec, b: Vec) -> float:
    """Rotation that maps local +y onto a→b."""
    return math.atan2(b[1] - a[1], b[0] - a[0]) - math.pi / 2


def pack(cells: list[Image.Image], cols: int) -> Image.Image:
    rows = math.ceil(len(cells) / cols)
    size = cells[0].size[0]
    sheet = Image.new("RGBA", (cols * size, rows * size), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.alpha_composite(c, ((i % cols) * size, (i // cols) * size))
    return sheet


def quantize(img: Image.Image, colors: int = 160) -> Image.Image:
    # clean near-zero alpha so it doesn't eat palette entries
    a = np.array(img)
    a[a[..., 3] < 8] = 0
    img = Image.fromarray(a, "RGBA")
    return img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
