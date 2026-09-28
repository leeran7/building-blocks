"""Low-poly chibi climber rig.

Renders a character to the app/public/climb contract: a 4x2 poses atlas
(idle, run-a, run-b, reach-a, reach-b, falling, celebrate, down) facing
three-quarter right, and a 6x1 back-view climb strip, in 192 px cells with the
foot anchor at (96, 172.5) and a 142.5 px idle height (the pack's (256, 460)
and 380 px in a 512 cell).

Parts are polygons in bone-local space, triangulated into facets seeded by the
part name, so the facet pattern is stable across frames and only the lighting
changes as a limb rotates.
"""
import math, random, hashlib
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

CELL = 192
PACK = 512
RPX = 768  # supersampled render size of one cell
F = RPX / PACK
AX, AY = 256.0, 460.0
REF_H = 380.0
LIGHT = np.array([-0.5, -0.7, 0.62]); LIGHT /= np.linalg.norm(LIGHT)
OUTLINE = (12, 11, 16)

# Skeleton (pack px, before per-character height normalisation).
TL, UL, FL, THL, SHL = 92.0, 52.0, 46.0, 44.0, 40.0


def hexc(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def lerp(a, b, t):
    return a + (b - a) * t


def rot(theta, p):
    c, s = math.cos(theta), math.sin(theta)
    return (c * p[0] - s * p[1], s * p[0] + c * p[1])


def seeded(name):
    return random.Random(int(hashlib.md5(name.encode()).hexdigest()[:8], 16))


class Frame:
    """Bone frame: world = o + R(theta) * (x*mx, y*my)."""

    def __init__(self, o, theta=0.0, mx=1.0, my=1.0):
        self.o, self.theta, self.mx, self.my = o, theta, mx, my

    def local(self, p):
        return (p[0] * self.mx, p[1] * self.my)

    def world(self, lp):  # lp already scaled
        q = rot(self.theta, lp)
        return (self.o[0] + q[0], self.o[1] + q[1])

    def __call__(self, p):
        return self.world(self.local(p))

    def child(self, p, dtheta=0.0, mx=None, my=None):
        return Frame(self(p), self.theta + dtheta, self.mx if mx is None else mx, self.my if my is None else my)


def limb(o, deg):
    """Frame for a limb hanging from o at world angle deg (0 = down, + = toward +x)."""
    return Frame(o, -math.radians(deg))


class Canvas:
    def __init__(self):
        self.items = []

    def poly(self, fr, pts, color, name, z, facet=True, dim=1.0, glow=None, stroke=True, rough=1.0):
        lp = [fr.local(p) for p in pts]
        self.items.append(dict(z=z, fr=fr, lp=lp, color=color, name=name, facet=facet,
                               dim=dim, glow=glow, stroke=stroke, rough=rough))

    def bounds(self):
        xs, ys = [], []
        for it in self.items:
            for p in it['lp']:
                w = it['fr'].world(p); xs.append(w[0]); ys.append(w[1])
        return min(xs), min(ys), max(xs), max(ys)

    def lowest(self, prefix):
        ys = [it['fr'].world(p)[1] for it in self.items if it['name'].startswith(prefix) for p in it['lp']]
        return max(ys)


def facet_tris(lp, name, fine):
    rnd = seeded(name)
    n = len(lp)
    cx = sum(p[0] for p in lp) / n; cy = sum(p[1] for p in lp) / n
    ext = max(math.hypot(p[0] - cx, p[1] - cy) for p in lp) or 1.0
    c = (cx + rnd.uniform(-0.15, 0.15) * ext, cy + rnd.uniform(-0.15, 0.15) * ext)
    tris = []
    for i in range(n):
        a, b = lp[i], lp[(i + 1) % n]
        L = math.hypot(a[0] - b[0], a[1] - b[1])
        if L > ext * fine:
            t = rnd.uniform(0.38, 0.62)
            m = (lerp(a[0], b[0], t), lerp(a[1], b[1], t))
            k = rnd.uniform(0.4, 0.62)
            mm = (lerp(c[0], m[0], k), lerp(c[1], m[1], k))
            tris += [(a, m, mm), (a, mm, c), (m, b, mm), (mm, b, c)]
        else:
            tris.append((a, b, c))
    return tris, (cx, cy), ext, rnd


def shade(color, k):
    return tuple(max(0, min(255, int(round(ch * k)))) for ch in color)


def rasterise(canvas, scale, dy=0.0):
    """Draw one PACK cell supersampled to RPX. scale/dy normalise about the anchor."""

    def tw(w):
        return ((AX + (w[0] - AX) * scale) * F, (AY + (w[1] + dy - AY) * scale) * F)

    img = Image.new('RGBA', (RPX, RPX), (0, 0, 0, 0))
    glow = Image.new('RGBA', (RPX, RPX), (0, 0, 0, 0))
    d = ImageDraw.Draw(img); gd = ImageDraw.Draw(glow)
    sw = max(1, int(round(1.3 * F * scale)))
    for it in sorted(canvas.items, key=lambda i: i['z']):
        fr, lp, base = it['fr'], it['lp'], it['color']
        wp = [tw(fr.world(p)) for p in lp]
        if not it['facet']:
            d.polygon(wp, fill=shade(base, it['dim']) + (255,))
        else:
            tris, (cx, cy), ext, rnd = facet_tris(lp, it['name'], 0.5)
            flip = -1 if fr.mx * fr.my < 0 else 1
            for tri in tris:
                tx = sum(p[0] for p in tri) / 3; ty = sum(p[1] for p in tri) / 3
                nx = (tx - cx) / ext + rnd.uniform(-0.4, 0.4) * it['rough']
                ny = (ty - cy) / ext + rnd.uniform(-0.4, 0.4) * it['rough']
                wn = rot(fr.theta, (nx, ny))
                nv = np.array([wn[0], wn[1], 1.1]); nv /= np.linalg.norm(nv)
                k = (0.58 + 0.66 * max(0.0, float(nv @ LIGHT))) * it['dim']
                d.polygon([tw(fr.world(p)) for p in tri], fill=shade(base, k) + (255,))
        if it['stroke']:
            d.line(wp + [wp[0]], fill=shade(base, 0.42 * it['dim']) + (255,), width=sw, joint='curve')
        if it['glow']:
            gd.polygon(wp, fill=it['glow'] + (255,))
    if glow.getbbox():
        g = np.array(glow.filter(ImageFilter.GaussianBlur(9 * F * scale))).astype(np.float32)
        ia = np.array(img).astype(np.float32)
        ga = g[..., 3:4] / 255.0
        ib = ia[..., 3:4] / 255.0
        # screen-blend glow over the figure, and a soft halo outside it
        rgb = ia[..., :3] + (255 - ia[..., :3]) * (g[..., :3] / 255.0) * ga * 0.9
        halo_a = np.minimum(1.0, ga * 1.1)
        out_a = ib + halo_a * (1 - ib)
        out_rgb = np.where(out_a > 0, (rgb * ib + g[..., :3] * halo_a * (1 - ib)) / np.maximum(out_a, 1e-6), 0)
        img = Image.fromarray(np.concatenate([np.clip(out_rgb, 0, 255), np.clip(out_a * 255, 0, 255)], 2).astype(np.uint8), 'RGBA')
    a = img.split()[3].point(lambda v: 255 if v > 150 else 0)
    grow = a.filter(ImageFilter.MaxFilter(7))
    out = Image.new('RGBA', img.size, OUTLINE + (0,))
    out.putalpha(grow)
    out.alpha_composite(img)
    return out


def opaque_rows(img, thr=48):
    a = np.array(img)[..., 3]
    rows = np.where(a.max(axis=1) > thr)[0]
    return rows[0], rows[-1]


def taper(curve, w0, w1):
    """Polygon around a polyline with width going w0 -> w1."""
    n = len(curve)
    left, right = [], []
    for i, p in enumerate(curve):
        a = curve[max(0, i - 1)]; b = curve[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        w = lerp(w0, w1, i / (n - 1)) / 2
        left.append((p[0] + nx * w, p[1] + ny * w)); right.append((p[0] - nx * w, p[1] - ny * w))
    return left + right[::-1]


def ngon(cx, cy, rx, ry, n, rot0=0.0):
    return [(cx + rx * math.cos(rot0 + 2 * math.pi * i / n), cy + ry * math.sin(rot0 + 2 * math.pi * i / n)) for i in range(n)]


def star(cx, cy, r0, r1, n, rot0=0.0, jitter=None, name='star'):
    rnd = seeded(name)
    pts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r0
        if jitter: r *= rnd.uniform(1 - jitter, 1 + jitter)
        a = rot0 + math.pi * i / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts
