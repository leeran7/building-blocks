import math
from rig import *
from rig import xf as _xf
HS = 1.15

def hx(pts, H, ang):
    return _xf(pts, H, ang, (HS, HS))



def horn(c, base, deg, length, w0, color, curl=35, segs=7, ridged=False, flip=1):
    """Tapered curved horn from `base`, starting in direction `deg` (0 = up,
    + = clockwise), bending by `curl` degrees over its length."""
    pts_l, pts_r, spine = [], [], []
    p = base
    a = deg
    step = length / segs
    for i in range(segs + 1):
        t = i / segs
        w = w0 * (1 - t) ** 0.9 + 1.2
        d = rot((0, -1), a)
        n = (-d[1], d[0])
        spine.append((p, w, n))
        pts_l.append(add(p, sc(n, w / 2)))
        pts_r.append(add(p, sc(n, -w / 2)))
        p = add(p, sc(d, step))
        a += curl / segs * flip
    tip = p
    outline = pts_l + [tip] + pts_r[::-1]
    c.outline_fill(outline)
    for i in range(segs):
        (p0, w0_, n0), (p1, w1, n1) = spine[i], spine[i + 1]
        quad = [add(p0, sc(n0, w0_ / 2)), add(p1, sc(n1, w1 / 2)),
                add(p1, sc(n1, -w1 / 2)), add(p0, sc(n0, -w0_ / 2))]
        k = 1.0 if not ridged else (1.0 if i % 2 == 0 else 0.8)
        # split lengthwise: lit and shaded halves
        m0, m1 = p0, p1
        c.flat([quad[0], quad[1], m1, m0], mul(color, 1.08 * k))
        c.flat([m0, m1, quad[2], quad[3]], mul(color, 0.78 * k))
        if ridged:
            c.flat([add(quad[0], (0, 0)), quad[3], lerp(quad[3], quad[2], 0.2), lerp(quad[0], quad[1], 0.2)],
                   mul(color, 0.55))
    last = spine[-1]
    c.flat([add(last[0], sc(last[2], last[1] / 2)), tip, add(last[0], sc(last[2], -last[1] / 2))],
           mul(color, 0.95))


class Viking(Char):
    accent = (244, 102, 28)
    dark = (60, 56, 60)
    glow = (255, 196, 70)

    def helm_pts(self, H, ang, back):
        if back:
            pts = [(-60, 10), (-56, -34), (-30, -62), (0, -70), (30, -62), (56, -34), (60, 10),
                   (46, 52), (0, 62), (-46, 52)]
        else:
            pts = [(-62, 8), (-54, -36), (-24, -64), (8, -70), (40, -58), (60, -28), (64, 10),
                   (56, 44), (26, 62), (-20, 60), (-52, 40)]
        return hx(pts, H, ang)

    def head(self, c, J, back):
        H, ang = J["H"], J["head"]
        # horns
        if back:
            for sx in (-1, 1):
                horn(c, hx([(sx * 50, -22)], H, ang)[0], ang + sx * 62, 74, 30,
                     self.acc, curl=-sx * 70, flip=1)
        else:
            horn(c, hx([(-50, -24)], H, ang)[0], ang - 58, 70, 28, mul(self.acc, 0.82), curl=62)
        c.poly(self.helm_pts(H, ang, back), self.dk, facets=2)
        if back:
            # rear ridge + neck guard
            c.poly(hx([(-6, -68), (6, -68), (8, 40), (-8, 40)], H, ang), mul(self.dk, 1.2), facets=1)
            c.poly(hx([(-46, 40), (46, 40), (40, 64), (-40, 64)], H, ang), self.acc, facets=1)
        else:
            # brow band
            c.poly(hx([(-56, -8), (-20, -18), (62, -16), (62, 0), (-20, 2), (-56, 8)], H, ang),
                   mul(self.dk, 0.8), facets=1)
            # eye slit (glowing)
            c.poly(hx([(-6, -8), (54, -10), (52, 2), (-4, 4)], H, ang), (20, 10, 6, 255), facets=1, ow=1)
            c.poly(hx([(0, -10), (20, -4), (18, 3), (2, 0)], H, ang), self.glow + (255,), glow=True, outline=None)
            c.poly(hx([(36, -4), (54, -12), (52, -2), (36, 3)], H, ang), self.glow + (255,), glow=True, outline=None)
            # beak nasal guard, orange
            c.poly(hx([(20, -26), (34, -26), (31, 0), (27, 48), (23, 0)], H, ang), self.acc, facets=1, ow=1.4)
            # cheek plates
            c.poly(hx([(-40, 10), (8, 12), (14, 48), (-18, 58), (-44, 36)], H, ang), mul(self.dk, 0.92))
            horn(c, hx([(52, -22)], H, ang)[0], ang + 50, 76, 30, self.acc, curl=-62)

    def pauldron(self, c, J, s, far, back):
        sh = J["sh" + s]
        sx = -1 if s == "L" else 1
        ang = J["lean"]
        base = mul(self.acc, 0.8 if far else 1.0)
        pts = [(-24 * sx, 6), (-14 * sx, -20), (14 * sx, -22), (34 * sx, 0), (26 * sx, 24), (-4 * sx, 24)]
        c.poly(xf(pts, sh, ang, (0.95, 0.95) if back else (1.25, 1.25)), base, facets=2)
        # dark spikes on top (fur / spiked plates)
        for k, (x, y, h) in enumerate([(-6, -18, 18), (10, -20, 20), (24, -10, 16)]):
            tip = (x * sx + 4 * sx, y - h)
            c.poly(xf([(x * sx - 8, y + 4), tip, (x * sx + 8, y + 4)], sh, ang),
                   mul(self.dk, 0.8 if far else 1.0), facets=1, ow=1.3)


class Sentinel(Char):
    accent = (66, 225, 240)
    dark = (58, 62, 70)
    glow = (190, 250, 255)

    def head_behind(self, c, J, back):
        H, ang = J["H"], J["head"]
        if back:
            return
        # swept-back crystal blades behind the helm
        for (x, y, a, L, w, k) in [(-40, -26, -74, 50, 28, 0.72), (-30, -48, -52, 60, 32, 0.85),
                                   (-8, -60, -28, 62, 30, 1.0), (16, -58, -6, 42, 22, 0.9)]:
            base = hx([(x, y)], H, ang)[0]
            d = rot((0, -1), ang + a)
            n = (-d[1], d[0])
            tip = add(base, sc(d, L))
            pts = [add(base, sc(n, w / 2)), add(lerp(base, tip, 0.55), sc(n, w * 0.45)), tip,
                   add(lerp(base, tip, 0.5), sc(n, -w * 0.35)), add(base, sc(n, -w / 2))]
            c.poly(pts, mul(self.acc, k), facets=1, contrast=0.5)

    def head(self, c, J, back):
        H, ang = J["H"], J["head"]
        if back:
            for (x, a, L, w) in [(-26, -34, 60, 22), (0, 0, 74, 24), (26, 34, 60, 22)]:
                base = hx([(x, -40)], H, ang)[0]
                d = rot((0, -1), ang + a)
                n = (-d[1], d[0])
                tip = add(base, sc(d, L))
                c.poly([add(base, sc(n, w / 2)), add(lerp(base, tip, 0.5), sc(n, w * 0.42)), tip,
                        add(lerp(base, tip, 0.5), sc(n, -w * 0.42)), add(base, sc(n, -w / 2))],
                       self.acc, facets=1, contrast=0.5)
            pts = [(-56, 10), (-50, -36), (-22, -62), (22, -62), (50, -36), (56, 10), (40, 54), (0, 64), (-40, 54)]
            c.poly(hx(pts, H, ang), self.dk, facets=2)
            c.poly(hx([(-40, 30), (0, 46), (40, 30), (34, 44), (0, 58), (-34, 44)], H, ang), self.acc, facets=1)
            return
        # angular helm, narrowing to a chin point toward the right
        pts = [(-58, 6), (-50, -36), (-20, -62), (16, -66), (46, -48), (60, -14), (62, 20),
               (44, 50), (18, 66), (-18, 58), (-50, 36)]
        c.poly(hx(pts, H, ang), self.dk, facets=2)
        # face plate (darker), a V down the front
        c.poly(hx([(4, -36), (58, -26), (60, 16), (40, 48), (22, 62), (12, 20)], H, ang), mul(self.dk, 0.7), facets=1)
        # visor slit + eyes
        c.poly(hx([(10, -8), (60, -12), (60, -2), (12, 4)], H, ang), (8, 16, 20, 255), facets=1, ow=0.8)
        c.poly(hx([(18, -7), (32, -9), (30, -1), (19, 0)], H, ang), self.glow + (255,), glow=True, outline=None)
        c.poly(hx([(42, -10), (56, -11), (55, -4), (42, -3)], H, ang), self.glow + (255,), glow=True, outline=None)
        # cyan blade running from the brow back over the helm
        c.poly(hx([(34, -30), (10, -58), (-30, -54), (-6, -40), (20, -20)], H, ang), self.acc, facets=1, ow=1.2, contrast=0.5)
        # side cheek shard
        c.poly(hx([(-46, -4), (-10, -18), (-2, 22), (-30, 40)], H, ang), mul(self.acc, 0.85), facets=1, contrast=0.5)

    def pauldron(self, c, J, s, far, back):
        sh = J["sh" + s]
        sx = -1 if s == "L" else 1
        ang = J["lean"]
        dk = mul(self.dk, 0.8 if far else 1.0)
        pts = [(-24 * sx, 6), (-12 * sx, -20), (16 * sx, -20), (32 * sx, 2), (24 * sx, 24), (-4 * sx, 24)]
        c.poly(xf(pts, sh, ang, (0.95, 0.95) if back else (1.25, 1.25)), dk, facets=2)
        # upward crystal shards
        for (x, h, k) in [(-4, 30, 1.0), (14, 22, 0.85)]:
            c.poly(xf([(x * sx - 8, -14), (x * sx + 2 * sx, -14 - h), (x * sx + 9, -12)], sh, ang),
                   mul(self.acc, (0.8 if far else 1.0) * k), facets=1, ow=1.3, contrast=0.5)
        c.poly(xf([(0, 4), (26 * sx, 2), (18 * sx, 20), (2 * sx, 20)], sh, ang),
               mul(self.acc, 0.8 if far else 1.0), facets=1)


class Ibex(Char):
    accent = (236, 186, 85)
    dark = (50, 47, 50)
    glow = (255, 176, 40)
    muzzle = (226, 214, 190)

    def head_behind(self, c, J, back):
        H, ang = J["H"], J["head"]
        if back:
            return
        # long ridged horns sweeping back (toward image left) and down
        horn(c, hx([(-2, -52)], H, ang)[0], ang - 28, 150, 30, mul(self.acc, 0.8), curl=-150, segs=12, ridged=True)

    def head(self, c, J, back):
        H, ang = J["H"], J["head"]
        if back:
            for sx in (-1, 1):
                horn(c, hx([(sx * 20, -46)], H, ang)[0], ang + sx * 20, 140, 30, self.acc,
                     curl=sx * 130, segs=12, ridged=True)
            pts = [(-50, 10), (-46, -34), (-20, -58), (20, -58), (46, -34), (50, 10), (36, 52), (0, 62), (-36, 52)]
            c.poly(hx(pts, H, ang), self.dk, facets=2)
            for sx in (-1, 1):  # ears
                c.poly(hx([(sx * 40, -30), (sx * 74, -22), (sx * 46, -10)], H, ang), self.acc, facets=1)
            return
        # goat head in three-quarter right: skull + long snout
        skull = [(-48, 4), (-42, -34), (-14, -56), (20, -54), (42, -36), (52, -10), (80, 8),
                 (90, 30), (80, 46), (52, 50), (22, 56), (-18, 52), (-44, 32)]
        c.poly(hx(skull, H, ang), self.dk, facets=2)
        # gold face mask on the upper snout / brow
        c.poly(hx([(8, -46), (38, -36), (54, -8), (82, 10), (70, 16), (40, 6), (14, -14)], H, ang),
               self.acc, facets=1, ow=1.3)
        # pale muzzle
        c.poly(hx([(52, 18), (82, 10), (92, 30), (82, 46), (56, 44)], H, ang), self.muzzle + (255,), facets=1, ow=1.3)
        c.poly(hx([(82, 22), (90, 26), (86, 30)], H, ang), (30, 26, 26, 255), facets=1, outline=None)
        # beard
        c.poly(hx([(40, 46), (60, 46), (52, 70)], H, ang), mul(self.dk, 0.8), facets=1)
        # eye
        c.poly(hx([(22, -18), (40, -22), (38, -10), (24, -8)], H, ang), (20, 10, 4, 255), facets=1, ow=0.8)
        c.poly(hx([(26, -17), (37, -20), (35, -12), (27, -11)], H, ang), self.glow + (255,), glow=True, outline=None)
        # ears
        c.poly(hx([(-28, -22), (-62, -2), (-30, 2)], H, ang), mul(self.dk, 0.9), facets=1)
        c.poly(hx([(-32, -14), (-54, -3), (-34, -2)], H, ang), mul(self.acc, 0.8), facets=1, outline=None)
        # near horn over the head, curling back
        horn(c, hx([(12, -52)], H, ang)[0], ang - 18, 160, 32, self.acc, curl=-150, segs=12, ridged=True)

    def boot_extra(self, c, J, s, far, back):
        top, sole = boot_pts(J, s, back)
        c.poly(sole, mul(self.acc, 0.7 if far else 0.9), facets=1)


CHARS = {"viking": Viking, "sentinel": Sentinel, "ibex": Ibex}
