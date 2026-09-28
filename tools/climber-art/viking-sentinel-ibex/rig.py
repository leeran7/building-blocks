"""Low-poly chibi climber rig. Draws a character in 512-px cell coordinates
(foot anchor (256, 460)), supersampled, then packs 192-px sheets."""
import math, random, sys
from PIL import Image, ImageDraw

import climb_cycle

SS = 3  # supersample factor over the 512 cell
CELL = 512
OUT = 192
LIGHT = (-0.55, -0.83)  # direction toward the light (upper left)

def mul(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c[:3]) + (255,)

def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)

def rot(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)

def add(a, b):
    return (a[0] + b[0], a[1] + b[1])

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])

def sc(v, k):
    return (v[0] * k, v[1] * k)

def dirv(deg):
    """Unit vector for a limb angle: 0 = straight down, +90 = image right."""
    a = math.radians(deg)
    return (math.sin(a), math.cos(a))

def norm(v):
    l = math.hypot(*v) or 1
    return (v[0] / l, v[1] / l)

def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


class Canvas:
    def __init__(self, seed=1):
        self.img = Image.new("RGBA", (CELL * SS, CELL * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.rng = random.Random(seed)
        self.ox = 0.0
        self.oy = 0.0

    G = 1.1  # global scale about the foot anchor

    def P(self, p):
        x = 256 + (p[0] + self.ox - 256) * self.G
        y = 460 + (p[1] + self.oy - 460) * self.G
        return (x * SS, y * SS)

    def flat(self, pts, color):
        self.d.polygon([self.P(p) for p in pts], fill=color)

    def poly(self, pts, color, facets=2, outline=(18, 16, 20, 255), ow=2.2,
             contrast=0.34, jitter=0.07, glow=False):
        """Faceted polygon: fan-triangulated from an off-centre apex, each facet
        shaded by which way it faces relative to the light, clipped to the
        polygon so concave shapes stay exact."""
        sp = [self.P(p) for p in pts]
        if outline is not None:
            self.d.polygon(sp, fill=outline, outline=outline, width=max(1, int(ow * SS * 2)))
        if glow:
            self.d.polygon(sp, fill=color)
            return
        x0 = int(min(p[0] for p in sp)) - 2
        y0 = int(min(p[1] for p in sp)) - 2
        x1 = int(max(p[0] for p in sp)) + 3
        y1 = int(max(p[1] for p in sp)) + 3
        w, h = max(1, x1 - x0), max(1, y1 - y0)
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in sp], fill=255)
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        span = max(max(p[0] for p in pts) - min(p[0] for p in pts),
                   max(p[1] for p in pts) - min(p[1] for p in pts))
        apex = (cx + LIGHT[0] * span * 0.12, cy + LIGHT[1] * span * 0.12)
        ring = []
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            ring.append(a)
            for k in range(1, facets):
                ring.append(lerp(a, b, k / facets))
        m = len(ring)
        L = lambda p: (self.P(p)[0] - x0, self.P(p)[1] - y0)
        ld.polygon([L(p) for p in pts], fill=mul(color, 0.86))
        for i in range(m):
            a, b = ring[i], ring[(i + 1) % m]
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            off = norm(sub(mid, apex))
            k = 0.86 + contrast * (off[0] * LIGHT[0] + off[1] * LIGHT[1])
            k += self.rng.uniform(-jitter, jitter)
            ld.polygon([L(apex), L(a), L(b)], fill=mul(color, k))
        self.img.paste(layer, (x0, y0), mask)

    def outline_fill(self, pts, outline=(18, 16, 20, 255), ow=2.2):
        sp = [self.P(p) for p in pts]
        self.d.polygon(sp, fill=outline, outline=outline, width=max(1, int(ow * SS * 2)))

    def circle(self, c, r, color):
        x, y = self.P(c)
        self.d.ellipse([x - r * SS, y - r * SS, x + r * SS, y + r * SS], fill=color)


def seg_quad(a, b, wa, wb):
    d = norm(sub(b, a))
    n = (-d[1], d[0])
    return [add(a, sc(n, wa / 2)), add(b, sc(n, wb / 2)),
            add(b, sc(n, -wb / 2)), add(a, sc(n, -wa / 2))]

def seg_hex(a, b, wa, wb, bulge=1.12, cap=0.35):
    """Segment with chamfered ends so joints overlap cleanly."""
    d = norm(sub(b, a))
    n = (-d[1], d[0])
    L = math.hypot(*sub(b, a))
    m = lerp(a, b, 0.45)
    wm = (wa + wb) / 2 * bulge
    return [sub(a, sc(d, wa * cap)),
            add(a, sc(n, wa / 2)), add(m, sc(n, wm / 2)), add(b, sc(n, wb / 2)),
            add(b, sc(d, wb * cap)),
            add(b, sc(n, -wb / 2)), add(m, sc(n, -wm / 2)), add(a, sc(n, -wa / 2))]

def ngon(c, rx, ry, n, start=0.0):
    return [(c[0] + rx * math.cos(math.radians(start + 360 * i / n)),
             c[1] + ry * math.sin(math.radians(start + 360 * i / n))) for i in range(n)]

def xf(pts, origin, deg, s=(1, 1)):
    """Scale then rotate points given relative to origin."""
    return [add(origin, rot((p[0] * s[0], p[1] * s[1]), deg)) for p in pts]


# ----------------------------------------------------------------------------
# Skeleton

DIM = dict(torso=88, thigh=46, shin=42, uarm=50, farm=44, neck=10,
           shoulder=40, hip=21, boot_h=18)

def skeleton(pose, back=False):
    """Joint positions for a pose, before the baseline shift."""
    P = (256.0 + pose.get("px", 0), 350.0)
    lean = pose.get("lean", 0)
    up = dirv(180 + lean)
    N = add(P, sc(up, DIM["torso"]))
    side = rot((1, 0), lean)
    J = dict(P=P, N=N, lean=lean, side=side, up=up)
    sw = DIM["shoulder"]
    J["shL"] = add(add(N, sc(side, -sw)), sc(up, -14))
    J["shR"] = add(add(N, sc(side, sw)), sc(up, -14))
    hw = pose.get("hip", DIM["hip"])  # runs pull the hips in: a side view has no hip width
    J["hipL"] = add(P, sc(side, -hw))
    J["hipR"] = add(P, sc(side, hw))
    for s in "LR":
        ua, fa = pose["arm" + s]
        st = pose.get("stretch" + s, 1.0)  # chibi arms stretch when thrown overhead
        e = add(J["sh" + s], sc(dirv(ua), DIM["uarm"] * st))
        h = add(e, sc(dirv(fa), DIM["farm"] * st))
        J["elb" + s], J["hand" + s] = e, h
        th, sh = pose["leg" + s]
        k = add(J["hip" + s], sc(dirv(th), DIM["thigh"]))
        an = add(k, sc(dirv(sh), DIM["shin"]))
        J["knee" + s], J["ank" + s] = k, an
        J["foot" + s] = pose.get("foot" + s, 0)
    J["H"] = add(N, sc(dirv(180 + lean + pose.get("head", 0)), 66))
    J["head"] = lean * 0.5 + pose.get("head", 0)
    return J

def boot_pts(J, s, back):
    an = J["ank" + s]
    ang = J["foot" + s]
    if back:
        pts = [(-15, -8), (15, -8), (18, 12), (-18, 12)]
        base = [(-17, 12), (17, 12), (19, 18), (-19, 18)]
    else:
        pts = [(-12, -9), (10, -9), (27, 4), (27, 12), (-14, 12)]
        base = [(-15, 12), (28, 12), (29, 18), (-16, 18)]
    return xf(pts, an, ang), xf(base, an, ang)

def lowest(J, back):
    y = -1e9
    for s in "LR":
        a, b = boot_pts(J, s, back)
        y = max(y, max(p[1] for p in b))
    return y


# ----------------------------------------------------------------------------
# Characters

DARK = (62, 62, 70)
OUTL = (16, 14, 18, 255)

class Char:
    accent = (200, 240, 80)
    dark = DARK
    glow = (255, 255, 255)

    def __init__(self):
        self.acc = self.accent + (255,)
        self.dk = self.dark + (255,)

    # --- body parts shared by everyone ---
    def arm(self, c, J, s, far, back):
        dk = mul(self.dk, 0.8 if far else 1.0)
        ac = mul(self.acc, 0.78 if far else 1.0)
        sh, e, h = J["sh" + s], J["elb" + s], J["hand" + s]
        c.poly(seg_hex(sh, e, 32, 28), dk)
        c.poly(seg_hex(e, h, 29, 26), dk)
        # forearm guard
        g0, g1 = lerp(e, h, 0.15), lerp(e, h, 0.8)
        c.poly(seg_hex(g0, g1, 31, 28, bulge=1.2), ac, facets=1)
        # fist
        d = norm(sub(h, e))
        fc = add(h, sc(d, 9))
        c.poly(ngon(fc, 18, 18, 7, math.degrees(math.atan2(d[1], d[0]))), mul(dk, 0.9))

    def leg(self, c, J, s, far, back):
        dk = mul(self.dk, 0.8 if far else 1.0)
        ac = mul(self.acc, 0.78 if far else 1.0)
        hp, k, an = J["hip" + s], J["knee" + s], J["ank" + s]
        c.poly(seg_hex(hp, k, 38, 33), dk)
        c.poly(seg_hex(k, an, 33, 29), dk)
        # knee / shin plate
        c.poly(seg_hex(lerp(k, an, 0.05), lerp(k, an, 0.75), 27, 21, bulge=1.15), ac, facets=1)
        top, sole = boot_pts(J, s, back)
        c.poly(top, mul(dk, 0.95))
        c.poly(sole, mul(dk, 0.6), facets=1)
        self.boot_extra(c, J, s, far, back)

    def boot_extra(self, c, J, s, far, back):
        pass

    def torso(self, c, J, back):
        P, N, lean = J["P"], J["N"], J["lean"]
        # hips / belt
        hip = xf([(-40, -18), (40, -18), (36, 14), (0, 22), (-36, 14)], P, lean)
        c.poly(hip, mul(self.dk, 0.85))
        # chest: wide at shoulders, narrow at waist
        ch = xf([(-50, 8), (-44, -14), (0, -22), (44, -14), (50, 8), (40, 70), (0, 80), (-40, 70)],
                N, lean)
        c.poly(ch, self.dk, facets=2)
        # chevron
        if back:
            chev = [(-38, 20), (0, 42), (38, 20), (38, 34), (0, 58), (-38, 34)]
        else:
            chev = [(-40, 22), (0, 48), (40, 22), (40, 36), (0, 64), (-40, 36)]
        c.poly(xf(chev, N, lean), self.acc, facets=1, ow=1.6)
        # tassets
        for sx in (-1, 1):
            t = xf([(sx * 12, -4), (sx * 40, -10), (sx * 42, 16), (sx * 20, 20)], P, lean)
            c.poly(t, mul(self.dk, 0.95), facets=1)

    def pauldron(self, c, J, s, far, back):
        sh = J["sh" + s]
        sx = -1 if s == "L" else 1
        ang = J["lean"]
        pts = [(-26 * sx, 4), (-10 * sx, -20), (18 * sx, -16), (30 * sx, 4), (22 * sx, 22), (-6 * sx, 24)]
        c.poly(xf(pts, sh, ang, (0.95, 0.95) if back else (1.3, 1.3)), mul(self.acc, 0.8 if far else 1.0), facets=2)

    def head(self, c, J, back):
        raise NotImplementedError

    def head_behind(self, c, J, back):
        """Parts drawn behind the body (e.g. horns sweeping back)."""
        pass

    # --- assembly ---
    def draw(self, c, pose, back=False):
        J = skeleton(pose, back)
        c.oy = pose["oy"] if "oy" in pose else 460 - lowest(J, back)
        near, far = ("L", "R") if pose.get("nearL", True) else ("R", "L")
        if back:
            self.head_behind(c, J, back)
            for s in "LR":
                self.leg(c, J, s, False, back)
            self.torso(c, J, back)
            self.head(c, J, back)
            for s in "LR":
                self.arm(c, J, s, False, back)
                self.pauldron(c, J, s, False, back)
            return
        self.head_behind(c, J, back)
        self.arm(c, J, far, True, back)
        self.pauldron(c, J, far, True, back)
        self.leg(c, J, far, True, back)
        self.leg(c, J, near, False, back)
        self.torso(c, J, back)
        self.head(c, J, back)
        self.pauldron(c, J, near, False, back)
        self.arm(c, J, near, False, back)


# ----------------------------------------------------------------------------
# Poses (facing right). arm = (upper, fore) angles, leg = (thigh, shin).

POSES = [
    dict(name="idle", armL=(-18, -8), armR=(18, 10), legL=(-8, -3), legR=(8, 3), lean=0),
    dict(name="run-a", armL=(-40, -15), armR=(55, 110), legL=(-44, -26), legR=(44, 2),
         lean=9, footL=-30, footR=10, px=-4, hip=0),
    # run-b mirrors run-a (legs and arms swapped), so the two-frame walk reads
    # as a stride on each foot rather than a stride and a hop
    dict(name="run-b", armL=(55, 110), armR=(-40, -15), legL=(44, 2), legR=(-44, -26),
         lean=9, footL=10, footR=-30, px=-4, hip=0),
    dict(name="reach-a", armL=(-150, -178), armR=(22, 12), stretchL=1.45, legL=(-10, -4), legR=(10, 5), lean=-2, head=-8),
    dict(name="reach-b", armL=(-20, -10), armR=(150, 178), stretchR=1.45, legL=(-10, -4), legR=(10, 5), lean=2, head=-8),
    dict(name="falling", armL=(-115, -140), armR=(115, 140), legL=(-35, -20), legR=(35, 20),
         lean=0, head=-4, footL=-15, footR=15),
    dict(name="celebrate", armL=(-140, -168), armR=(140, 168), stretchL=1.4, stretchR=1.4, legL=(-10, -4), legR=(10, 4), lean=0, head=-6),
    dict(name="down", armL=(40, 10), armR=(60, 25), legL=(85, -85), legR=(100, -80),
         lean=16, head=12, footL=-20, footR=-15, px=-14),
]

def climb_pose(i):
    """Frame i of the shared hand-over-hand cycle (../climb_cycle.py), as joint angles."""
    G = Canvas.G
    J = skeleton(dict(armL=(0, 0), armR=(0, 0), legL=(0, 0), legR=(0, 0)), True)
    p = dict(lean=0, px=0, head=0)
    for s, side, sgn in (("L", "l", -1), ("R", "r", 1)):
        sh = J["sh" + s]
        drop, out, _ = climb_cycle.hand(i, side)
        hand = (sh[0] + sgn * (40 + out / G), sh[1] - 124 + drop / G)
        el, hd, st = climb_cycle.ik(sh, hand, DIM["uarm"], DIM["farm"], -sgn)
        p["arm" + s] = (climb_cycle.limb_deg(sh, el), climb_cycle.limb_deg(el, hd))
        p["stretch" + s] = st
        hp = J["hip" + s]
        lift, _ = climb_cycle.foot(i, side)
        ankle = (hp[0] + sgn * 12, hp[1] + (DIM["thigh"] + DIM["shin"]) * 0.97 - lift / G)
        kn, an, _ = climb_cycle.ik(hp, ankle, DIM["thigh"], DIM["shin"], sgn)
        p["leg" + s] = (climb_cycle.limb_deg(hp, kn), climb_cycle.limb_deg(kn, an))
    return p


def render_cell(ch, pose, back=False, seed=3):
    c = Canvas(seed)
    ch.draw(c, pose, back)
    return c.img.resize((OUT, OUT), Image.LANCZOS)

def build(ch, cid, outdir):
    poses = Image.new("RGBA", (OUT * 4, OUT * 2), (0, 0, 0, 0))
    for i, p in enumerate(POSES):
        poses.alpha_composite(render_cell(ch, p, seed=10 + i), ((i % 4) * OUT, (i // 4) * OUT))
    climb = Image.new("RGBA", (OUT * 6, OUT), (0, 0, 0, 0))
    # climb frames hang from one fixed root (frame 0 has a foot on the anchor), so a
    # lifted foot rises instead of the whole body dropping to meet it
    oy = 460 - lowest(skeleton(climb_pose(0), True), True)
    for i in range(climb_cycle.FRAMES):
        p = climb_pose(i)
        p["oy"] = oy
        c = Canvas(40)  # same seed every frame: identical facets, only joints move
        ch.draw(c, p, back=True)
        climb.alpha_composite(c.img.resize((OUT, OUT), Image.LANCZOS), (i * OUT, 0))
    return poses, climb

def quantise(img):
    return img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
