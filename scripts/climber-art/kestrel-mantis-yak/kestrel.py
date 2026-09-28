"""Kestrel: chibi bird-of-prey warrior (slate-blue crest, cream face, hooked beak)."""

from climber import Climber
from rig import Frame, add, norm, rot, scl, sub

P = dict(
    blue="#2d5fa2",
    sky="#4a9fef",
    orange="#c96c3a",
    rust="#8a4228",
    cream="#ecd3a8",
    char="#2a2d36",
    dark="#1a1c23",
    yellow="#f2b43a",
    ydark="#b57d1f",
    eye="#9fe0ff",
    eyeglow="#3fa9ff",
)


class Kestrel(Climber):
    id = "kestrel"
    torso_w = 1.55
    shoulder = (18.0, -32.0)
    hip = (13.0, -18.0)
    back_shoulder = 54.0
    back_hip = 26.0

    def c(self, k, d=1.0):
        return self.col(P[k], d)

    def side(self, name):
        return -1 if name.startswith("backL") else 1

    # --- torso --------------------------------------------------------------
    def torso(self, S, T, d):
        S.poly(T([(-30, 4), (-38, -44), (-30, -84), (-4, -98), (26, -90), (38, -54), (32, -8), (4, 8)]),
               self.c("char", d), "torso")
        # layered orange breast feathers and a cream chevron
        S.poly(T([(2, -86), (28, -84), (36, -56), (22, -34), (6, -52)]), self.c("orange", d), "chest1")
        S.poly(T([(-4, -60), (20, -40), (30, -18), (10, -4), (-8, -22)]), self.c("rust", d), "chest2")
        S.poly(T([(8, -70), (26, -60), (16, -40)]), self.c("cream", d), "chev", strength=0.2)
        # belt
        S.poly(T([(-34, -8), (34, -12), (36, 4), (-32, 10)]), self.c("dark", d), "belt", strength=0.2)
        S.poly(T([(12, -10), (26, -11), (26, 3), (12, 4)]), self.c("sky", d), "buckle")

    def torso_back(self, S, T):
        S.poly(T([(-40, 6), (-46, -44), (-36, -88), (0, -100), (36, -88), (46, -44), (40, 6), (0, 12)]),
               self.c("char", 0.95), "tback")
        # folded wing feathers down the back
        for sx in (-1, 1):
            F = Frame(T.p(0, 0), 0, sx)
            S.poly(F([(4, -86), (34, -80), (30, -40), (14, -12), (6, -40)]), self.c("blue", 0.95), f"wing{sx}")
            S.poly(F([(8, -60), (26, -50), (18, -18), (8, -30)]), self.c("sky", 0.9), f"wingb{sx}")
        S.poly(T([(-44, -8), (44, -8), (44, 6), (-44, 8)]), self.c("dark"), "beltb", strength=0.2)

    def behind(self, S, T, pose):
        # short fan of tail feathers behind the hips
        base = T.p(-26, -6)
        for i, (ang, ln, col) in enumerate(((-58, 50, "rust"), (-72, 58, "orange"), (-88, 48, "rust"))):
            F = Frame(base, 0)
            tip = rot((0, ln), ang)
            L = norm(tip)
            n = (-L[1], L[0])
            pts = [(0, 0), add(scl(n, 9), scl(L, ln * 0.5)), tip, sub(scl(L, ln * 0.5), scl(n, 9))]
            S.poly(F(pts), self.c(col, 0.85), f"tail{i}")
            S.poly(F([scl(tip, 0.72), add(scl(tip, 0.86), scl(n, 5)), tip, add(scl(tip, 0.86), scl(n, -5))]),
                   self.c("dark", 0.9), f"tailtip{i}", strength=0.15)

    def behind_back(self, S, T, t):
        pass

    def over_back(self, S, T, t):
        base = T.p(0, 2)
        for i, (ang, ln, col) in enumerate(((-20, 50, "rust"), (0, 60, "orange"), (20, 50, "rust"))):
            F = Frame(base, 0)
            tip = rot((0, ln), ang)
            L = norm(tip)
            n = (-L[1], L[0])
            S.poly(F([(0, 0), add(scl(n, 10), scl(L, ln * 0.5)), tip, sub(scl(L, ln * 0.5), scl(n, 10))]),
                   self.c(col), f"tailb{i}")
            S.poly(F([scl(tip, 0.74), add(scl(tip, 0.87), scl(n, 5)), tip, add(scl(tip, 0.87), scl(n, -5))]),
                   self.c("dark"), f"tailbtip{i}", strength=0.15)

    # --- head -----------------------------------------------------------------
    def head(self, S, H):
        S.mark("headTop", H.p(-6, -88))
        # crest spikes sweeping back
        for i, pts in enumerate((
            [(-20, -80), (-72, -104), (-52, -70)],
            [(-46, -64), (-104, -74), (-68, -40)],
            [(-62, -34), (-108, -30), (-72, -8)],
        )):
            S.poly(H(pts), self.c("sky" if i % 2 == 0 else "blue"), f"crest{i}")
        S.poly(H([(-70, 12), (-80, -30), (-60, -72), (-18, -90), (30, -84), (62, -56), (74, -20), (72, 18),
                  (48, 50), (0, 60), (-44, 46)]), self.c("blue"), "skull")
        S.poly(H([(-72, 8), (-44, 46), (-12, 60), (-26, 22), (-50, 0)]), self.c("orange"), "nape")
        S.poly(H([(4, -52), (40, -62), (66, -48), (60, -30), (28, -34)]), self.c("sky"), "brow")
        # cream face and throat
        S.poly(H([(4, -16), (56, -30), (74, -10), (70, 22), (48, 50), (8, 54), (-8, 24)]), self.c("cream"), "face")
        # dark malar stripe under the eye
        S.poly(H([(20, -40), (58, -44), (62, -28), (40, -20), (32, 12), (18, 8)]), self.c("dark"), "mask",
               strength=0.2)
        # beak: hooked, golden
        S.poly(H([(58, -26), (88, -22), (108, -6), (106, 18), (96, 12), (86, 4), (62, 12)]), self.c("yellow"),
               "beak")
        S.poly(H([(62, 8), (88, 6), (82, 20), (62, 20)]), self.c("ydark"), "jaw")
        # glowing eye
        S.poly(H([(30, -36), (48, -44), (56, -32), (40, -26)]), self.c("eye"), "eye", strength=0.1, ow=1.5)
        S.glow(H.p(44, -34), 14, self.c("eyeglow"), 0.85)

    def head_back(self, S, H):
        S.mark("headTop", H.p(0, -88))
        for sx in (-1, 1):
            F = Frame(H.p(0, 0), 0, sx)
            S.poly(F([(20, -80), (70, -100), (54, -66)]), self.c("sky"), f"bcrest0{sx}")
            S.poly(F([(40, -56), (96, -62), (70, -30)]), self.c("blue"), f"bcrest1{sx}")
        S.poly(H([(-74, 10), (-78, -34), (-52, -76), (0, -92), (52, -76), (78, -34), (74, 10), (40, 50), (0, 58),
                  (-40, 50)]), self.c("blue", 0.95), "bskull")
        S.poly(H([(-50, 16), (0, 4), (50, 16), (34, 50), (0, 58), (-34, 50)]), self.c("orange", 0.95), "bnape")
        S.poly(H([(-22, -84), (0, -92), (22, -84), (10, -40), (-10, -40)]), self.c("sky", 0.95), "bstripe")

    # --- limbs ------------------------------------------------------------------
    def thigh_part(self, S, a, b, d, name):
        S.seg(a, b, self.thigh_w, self.thigh_w * 0.8, self.c("rust", d), name)

    def shin_part(self, S, a, b, d, name):
        S.seg(a, b, self.shin_w * 0.8, self.shin_w * 0.7, self.c("yellow", d), name)

    def foot(self, S, F, d, name):
        S.poly(F([(-16, -8), (10, -10), (30, 2), (38, 16), (-18, 16)]), self.c("dark", d), name, tags=("ground",))
        for i, x in enumerate((12, 26, 40)):
            S.poly(F([(x - 7, 8), (x + 3, 10), (x + 5, 20), (x - 5, 18)]), self.c("ydark", d), f"{name}.t{i}",
                   ow=1.6, strength=0.1, tags=("ground",))

    def foot_back(self, S, F, d, name):
        S.poly(F([(-18, -8), (18, -8), (22, 16), (-22, 16)]), self.c("dark", d), name, tags=("ground",))

    def upper_part(self, S, a, b, d, name):
        S.seg(a, b, self.upper_w, self.upper_w * 0.85, self.c("char", d), name)

    def fore_part(self, S, a, b, d, name):
        S.seg(a, b, self.fore_w, self.fore_w * 0.95, self.c("dark", d), name)
        m = add(a, scl(sub(b, a), 0.5))
        S.gem(m, 10, self.c("sky", d), name + ".plate", n=4, squash=0.7, angle=0)

    def hand(self, S, wrist, dv, d, name):
        c = add(wrist, scl(dv, 8))
        S.gem(c, 16, self.c("char", d), name, n=6)
        for i, off in enumerate((-7, 0, 7)):
            n = (-dv[1], dv[0])
            base = add(c, add(scl(dv, 8), scl(n, off)))
            S.poly([base, add(base, add(scl(dv, 9), scl(n, 2))), add(base, scl(n, 4))], self.c("ydark", d),
                   f"{name}.c{i}", ow=1.2, strength=0.1)

    def shoulder_pad(self, S, at, angle, d, name):
        F = Frame(at, angle, self.side(name))
        S.poly(F([(-26, -16), (10, -24), (34, -8), (28, 26), (6, 36), (-20, 22)]), self.c("blue", d), name)
        S.poly(F([(-2, -12), (28, -6), (22, 22), (4, 30)]), self.c("sky", d), name + ".f")
        S.poly(F([(-18, 14), (2, 22), (-4, 40), (-16, 30)]), self.c("blue", d * 0.85), name + ".g")


CHARACTER = Kestrel()
