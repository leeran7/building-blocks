"""Cobra, Badger and Wolf: heads, tails and silhouettes on the shared rig."""
import math
from rig import *
from body import Character, TL


def tail_curve(o_x, o_y, deg, segs, length, curl, droop):
    """Polyline from (o_x,o_y) going backward (-x), bending by `curl` deg/seg."""
    pts = [(o_x, o_y)]
    a = math.radians(180 + droop + deg)  # pointing back (-x), droop tilts downward
    step = length / segs
    x, y = o_x, o_y
    for i in range(segs):
        x += math.cos(a) * step; y += math.sin(a) * step
        pts.append((x, y))
        a += math.radians(curl)
    return pts


class Cobra(Character):
    id = 'cobra'
    DARK, MID, ACCENT, LIGHT, EYE = '#262b3d', '#3d4358', '#1982f5', '#e8b53a', '#b9e4ff'
    bulk = 0.95

    def torso_detail(self, cv, fr, back):
        if back:
            return Character.torso_detail(self, cv, fr, back)
        # gold belly scutes, stacked chevrons down the front
        for i in range(4):
            y0 = -TL + 6 + i * 21
            w = 26 - i * 2
            cx = 14
            cv.poly(fr, [(cx - w, y0), (cx + w, y0 - 2), (cx + w - 4, y0 + 12), (cx, y0 + 22), (cx - w + 4, y0 + 12)],
                    self.lt, f'scute{i}', 33 + i * 0.01, dim=1.0 - i * 0.05)

    def behind(self, cv, fr, back):
        # the flared hood, fanned behind head and shoulders
        if back:
            hood = [(-96, 18), (-116, -52), (-100, -118), (-58, -160), (0, -176), (58, -160), (100, -118), (116, -52),
                    (96, 18), (40, 30), (-40, 30)]
            cv.poly(fr, hood, self.ac, 'hood', 55)
            cv.poly(fr, [(0, -150), (34, -96), (0, -30), (-34, -96)], self.dk, 'hood-diamond', 56)
            for s in (-1, 1):
                cv.poly(fr, ngon(s * 48, -92, 16, 12, 6, 0.4), self.lt, f'hood-eye{s}', 57, dim=0.9)
                cv.poly(fr, ngon(s * 48, -92, 7, 6, 5, 0.2), self.dk, f'hood-pupil{s}', 58, facet=False)
            return
        hood = [(-20, 22), (-78, 10), (-106, -40), (-104, -104), (-78, -150), (-34, -172), (10, -168), (44, -140),
                (40, -60), (20, 10)]
        cv.poly(fr, hood, self.ac, 'hood', 25)
        cv.poly(fr, [(-30, 6), (-70, -20), (-84, -80), (-64, -128), (-26, -140), (0, -80)], self.dk, 'hood-inner', 26, dim=0.9)

    def head(self, cv, fr):
        # neck with gold throat
        cv.poly(fr, [(-22, 14), (28, 14), (34, -44), (-18, -50)], self.dk, 'neck', 44)
        cv.poly(fr, [(6, 12), (30, 12), (36, -44), (10, -46)], self.lt, 'throat', 45, dim=0.95)
        head = [(-40, -54), (-46, -104), (-26, -138), (16, -150), (58, -134), (94, -106), (114, -86), (108, -68),
                (74, -58), (30, -48)]
        cv.poly(fr, head, self.ac, 'head', 50)
        cv.poly(fr, [(-40, -58), (-44, -100), (-10, -96), (0, -60)], self.dk, 'cheek', 51, dim=0.95)
        jaw = [(-4, -56), (30, -50), (74, -58), (106, -68), (84, -46), (40, -34), (4, -38)]
        cv.poly(fr, jaw, self.lt, 'jaw', 52)
        cv.poly(fr, [(24, -120), (86, -102), (92, -94), (30, -104)], self.dk, 'brow', 53, dim=0.8)
        cv.poly(fr, [(48, -100), (78, -94), (70, -84), (46, -88)], self.eye, 'eye', 54, facet=False, glow=self.ac, stroke=False)
        cv.poly(fr, [(0, -106), (16, -103), (14, -95), (0, -97)], self.eye, 'eye2', 49, facet=False, glow=self.ac, stroke=False, dim=0.85)
        cv.poly(fr, [(100, -86), (108, -84), (106, -80)], self.dk, 'nostril', 54, facet=False, stroke=False)

    def back_head(self, cv, fr):
        cv.poly(fr, [(-40, -30), (-44, -110), (0, -140), (44, -110), (40, -30)], self.ac, 'backhead', 50)

    def tail(self, cv, fr, deg, back):
        o = fr.o
        if back:
            c = [(0, 0), (4, 30), (0, 58), (-12, 80), (-26, 90)]
            c = [(o[0] + x, o[1] + y) for x, y in c]
            cv.poly(Frame((0, 0)), taper(c, 26, 5), self.dk, 'tail', 60)
            return
        c = tail_curve(o[0], o[1], deg, 7, 110, 22, 50)
        cv.poly(Frame((0, 0)), taper(c, 28, 4), self.dk, 'tail', 18, dim=0.85)


class Badger(Character):
    id = 'badger'
    DARK, MID, ACCENT, LIGHT, EYE = '#26242c', '#4a4750', '#be4df4', '#ecebf0', '#f6d6ff'
    bulk = 1.14
    limb_w = 1.1

    def head(self, cv, fr):
        cv.poly(fr, [(-26, 14), (30, 14), (36, -40), (-22, -44)], self.dk, 'neck', 44)
        head = [(-60, -30), (-72, -84), (-56, -128), (-16, -152), (34, -150), (72, -124), (98, -92), (116, -66),
                (112, -48), (82, -36), (24, -22)]
        cv.poly(fr, head, (30, 29, 36), 'head', 50)
        # ears
        cv.poly(fr, ngon(4, -146, 20, 16, 7, 0.2), (34, 33, 40), 'ear', 49)
        cv.poly(fr, ngon(4, -146, 10, 8, 6, 0.2), self.md, 'ear-in', 49.5, dim=0.9)
        cv.poly(fr, ngon(-50, -126, 17, 14, 7, 0.4), (30, 29, 36), 'ear2', 48, dim=0.75)
        # white stripe from the nose over the crown
        s = taper([(108, -62), (84, -94), (46, -128), (6, -150), (-34, -144), (-62, -112)], 20, 26)
        cv.poly(fr, s, self.lt, 'stripe', 51)
        # pale cheeks and jaw
        cv.poly(fr, [(-40, -40), (4, -66), (46, -64), (82, -52), (104, -48), (80, -30), (20, -18), (-30, -22)],
                (205, 203, 212), 'cheek', 51.5)
        cv.poly(fr, [(106, -70), (122, -66), (120, -50), (104, -50)], (18, 17, 22), 'nose', 53)
        cv.poly(fr, [(50, -86), (76, -82), (70, -72), (48, -76)], self.eye, 'eye', 54, facet=False, glow=self.ac, stroke=False)
        cv.poly(fr, [(4, -92), (18, -90), (16, -82), (4, -84)], self.eye, 'eye2', 52, facet=False, glow=self.ac, stroke=False, dim=0.85)
        cv.poly(fr, [(40, -96), (82, -90), (84, -84), (44, -88)], self.ac, 'brow', 53, dim=0.9)

    def back_head(self, cv, fr):
        cv.poly(fr, [(-70, -24), (-80, -86), (-56, -134), (0, -154), (56, -134), (80, -86), (70, -24), (0, -6)],
                (30, 29, 36), 'backhead', 50)
        for s in (-1, 1):
            cv.poly(fr, ngon(s * 50, -130, 19, 16, 7, 0.2), (34, 33, 40), f'ear{s}', 49)
        cv.poly(fr, taper([(0, -156), (0, -110), (0, -60), (0, -26)], 30, 16), self.lt, 'stripe', 51)

    def tail(self, cv, fr, deg, back):
        o = fr.o
        if back:
            cv.poly(Frame(o), ngon(0, 14, 16, 18, 7, 0.3), self.md, 'tail', 60)
            return
        c = tail_curve(o[0], o[1] - 4, deg, 3, 36, 8, 25)
        cv.poly(Frame((0, 0)), taper(c, 26, 12), self.md, 'tail', 18, dim=0.9)


class Wolf(Character):
    id = 'wolf'
    DARK, MID, ACCENT, LIGHT, EYE = '#2f2b35', '#5a5661', '#f43fba', '#a6a2ad', '#ffd0f0'
    bulk = 1.0

    def behind(self, cv, fr, back):
        # shard-like ruff around the neck and shoulders
        cx, cy = (0, -20)
        cv.poly(fr, star(cx, cy, 52, 84, 9, -math.pi / 2 + 0.2, 0.12, 'ruff-back'), self.ac, 'ruff-back', 25 if not back else 45, dim=0.9)
        if not back:
            cv.poly(fr, star(cx + 10, cy + 10, 40, 64, 8, 0.1, 0.12, 'ruff-front'), self.dk, 'ruff-front', 45)

    def head(self, cv, fr):
        head = [(-54, -40), (-62, -96), (-40, -134), (0, -150), (40, -140), (64, -112), (80, -90), (122, -78),
                (130, -62), (114, -50), (70, -42), (20, -32)]
        cv.poly(fr, head, self.dk, 'head', 50)
        # ears
        cv.poly(fr, [(-50, -118), (-50, -196), (-14, -146)], self.dk, 'ear2', 48, dim=0.75)
        cv.poly(fr, [(-2, -138), (24, -214), (50, -130)], self.dk, 'ear', 51)
        cv.poly(fr, [(10, -140), (24, -192), (38, -136)], self.ac, 'ear-in', 52, dim=0.9)
        # muzzle and cheek fur
        cv.poly(fr, [(62, -88), (122, -78), (130, -62), (114, -50), (70, -44), (54, -62)], self.lt, 'muzzle', 52)
        cv.poly(fr, [(14, -64), (58, -62), (72, -42), (34, -28), (-6, -40)], (190, 186, 196), 'cheek', 51.5)
        cv.poly(fr, [(118, -84), (134, -78), (132, -64), (118, -68)], (16, 15, 20), 'nose', 54)
        cv.poly(fr, [(22, -108), (74, -100), (82, -92), (28, -98)], self.ac, 'brow', 53)
        cv.poly(fr, [(44, -94), (70, -90), (64, -80), (42, -84)], self.eye, 'eye', 54, facet=False, glow=self.ac, stroke=False)
        cv.poly(fr, [(0, -98), (14, -96), (12, -88), (0, -90)], self.eye, 'eye2', 49, facet=False, glow=self.ac, stroke=False, dim=0.85)
        # forehead shards
        cv.poly(fr, [(-40, -128), (0, -148), (30, -140), (-10, -118)], self.md, 'crest', 51, dim=0.9)

    def back_head(self, cv, fr):
        cv.poly(fr, [(-60, -34), (-66, -100), (-40, -138), (0, -150), (40, -138), (66, -100), (60, -34), (0, -18)],
                self.dk, 'backhead', 50)
        for s in (-1, 1):
            cv.poly(fr, [(s * 20, -140), (s * 46, -210), (s * 64, -110)], self.dk, f'ear{s}', 49)
        cv.poly(fr, [(-34, -128), (0, -146), (34, -128), (0, -96)], self.md, 'crest', 51)
        cv.poly(fr, star(0, -30, 40, 62, 8, 0.2, 0.12, 'ruff-front-b'), self.dk, 'ruff-b', 52)

    def tail(self, cv, fr, deg, back):
        o = fr.o
        if back:
            c = [(o[0], o[1]), (o[0] + 6, o[1] + 34), (o[0] + 2, o[1] + 66)]
            cv.poly(Frame((0, 0)), taper(c, 30, 20), self.md, 'tail', 60)
            return
        c = tail_curve(o[0], o[1] - 4, deg, 5, 96, -10, 30)
        poly = taper(c, 30, 30)
        cv.poly(Frame((0, 0)), poly, self.md, 'tail', 18)
        tip = taper(c[3:], 30, 10)
        cv.poly(Frame((0, 0)), tip, self.lt, 'tail-tip', 18.5)


CHARS = {c.id: c for c in (Cobra, Badger, Wolf)}
