"""Yak: chibi heavy yak warrior (wide tan horns, crimson shaggy mane, glowing eyes)."""

from climber import Climber
from rig import Frame, add, lerp, scl

P = dict(
    crimson="#ea4239",
    red="#b3302a",
    dred="#6e1616",
    char="#2e2626",
    dark="#171010",
    muzzle="#4a3e3a",
    horn="#d9ad8c",
    hornd="#9c7456",
    eye="#ffc46a",
    eyeglow="#ff8a2a",
)


class Yak(Climber):
    id = "yak"
    thigh_w = 44.0
    shin_w = 40.0
    upper_w = 36.0
    fore_w = 34.0
    torso_w = 1.75
    shoulder = (18.0, -32.0)
    hip = (13.0, -18.0)
    back_shoulder = 56.0
    back_hip = 26.0
    hand_out = 30.0

    pose_overrides = {
        "idle": dict(nL=(12, 6, 0), fL=(-11, 6, 0)),
        # keep the horn tips inside the cell margin
        "reach-a": dict(head=-2),
        "reach-b": dict(head=-2),
        "falling": dict(head=-2, lift=4),
        "celebrate": dict(head=-2, lift=2),
    }

    def c(self, k, d=1.0):
        return self.col(P[k], d)

    def side(self, name):
        return -1 if name.startswith("backL") else 1

    # --- torso ------------------------------------------------------------------
    def torso(self, S, T, d):
        S.poly(T([(-32, 6), (-38, -44), (-32, -86), (-4, -98), (28, -90), (38, -54), (34, -8), (4, 10)]),
               self.c("char", d), "torso")
        S.poly(T([(-2, -88), (28, -84), (36, -56), (20, -40), (4, -54)]), self.c("crimson", d), "fur1")
        S.poly(T([(-10, -58), (16, -44), (24, -22), (4, -12), (-12, -28)]), self.c("red", d), "fur2")
        S.poly(T([(-36, -8), (36, -12), (38, 6), (-34, 12)]), self.c("dark", d), "belt", strength=0.25)
        S.poly(T([(12, -10), (26, -11), (26, 4), (12, 5)]), self.c("horn", d), "buckle")

    def torso_back(self, S, T):
        S.poly(T([(-40, 6), (-46, -44), (-36, -88), (0, -100), (36, -88), (46, -44), (40, 6), (0, 12)]),
               self.c("char", 0.95), "tback")
        S.poly(T([(-44, -8), (44, -8), (44, 6), (-44, 8)]), self.c("dark"), "beltb", strength=0.25)

    def behind(self, S, T, pose):
        # tufted tail
        S.curve(T([(-30, -10), (-46, 0), (-52, 20)]), 10, 6, self.c("char", 0.8), "tail")
        S.gem(T.p(-54, 28), 10, self.c("red", 0.8), "tailtuft", n=5)

    def behind_back(self, S, T, t):
        pass

    def over_back(self, S, T, t):
        # shaggy mantle down the upper back
        S.poly(T([(-44, -90), (-20, -100), (20, -100), (44, -90), (40, -60), (26, -44), (16, -58), (4, -36),
                  (-8, -56), (-22, -42), (-30, -62), (-42, -52)]), self.c("red"), "bmantle")
        S.gem(T.p(0, -18), 12, self.c("horn", 0.9), "bbuckle", n=4)

    # --- head ---------------------------------------------------------------------
    def horn(self, S, H, line, d, name):
        S.curve(H(line), 24 * H.k, 5 * H.k, self.c("horn", d), name)
        S.curve(H(line[:2]), 26 * H.k, 20 * H.k, self.c("hornd", d), name + ".base", strength=0.25)

    def head(self, S, H):
        S.mark("headTop", H.p(0, -80))
        self.horn(S, H, [(-26, -56), (-66, -66), (-94, -80), (-104, -102)], 0.75, "hornF")
        # back mane
        S.poly(H([(-36, -60), (-72, -44), (-90, -10), (-80, 30), (-54, 58), (-36, 20), (-46, -14)]),
               self.c("red"), "mane")
        S.poly(H([(-62, -40), (-40, -72), (10, -80), (50, -58), (74, -20), (90, 10), (84, 36), (56, 54), (10, 52),
                  (-36, 40), (-64, 8)]), self.c("char"), "skull")
        S.poly(H([(44, -4), (86, 4), (96, 28), (80, 48), (50, 48), (36, 22)]), self.c("muzzle"), "muzzle")
        S.gem(H.p(84, 24), 6 * H.k, self.c("dark"), "nostril", n=5, ow=1.2)
        # forehead fringe of crimson shards
        S.poly(H([(-34, -64), (-6, -84), (26, -80), (50, -58), (36, -42), (26, -56), (14, -34), (0, -54),
                  (-14, -36), (-22, -52)]), self.c("crimson"), "fringe")
        # beard
        S.poly(H([(8, 42), (44, 52), (36, 78), (20, 64), (6, 82), (-6, 60), (-20, 70), (-16, 44)]),
               self.c("dred"), "beard")
        # eyes
        S.poly(H([(-8, -30), (8, -34), (8, -24), (-6, -22)]), self.c("eye", 0.8), "eyeF", strength=0.1, ow=1.4)
        S.poly(H([(30, -30), (54, -36), (56, -24), (36, -20)]), self.c("eye"), "eyeN", strength=0.1, ow=1.4)
        S.glow(H.p(44, -28), 16, self.c("eyeglow"), 0.85)
        self.horn(S, H, [(22, -58), (62, -66), (96, -78), (114, -100)], 1.0, "hornN")

    def head_back(self, S, H):
        S.mark("headTop", H.p(0, -80))
        for sx in (-1, 1):
            F = Frame(H.p(0, 0), 0, sx, k=H.k)
            S.curve(F([(28, -58), (66, -66), (98, -80), (110, -102)]), 24 * H.k, 5 * H.k, self.c("horn"),
                    f"bhorn{sx}")
        S.poly(H([(-72, 10), (-76, -34), (-50, -74), (0, -88), (50, -74), (76, -34), (72, 10), (50, 48), (0, 60),
                  (-50, 48)]), self.c("red"), "bmane")
        S.poly(H([(-40, -70), (0, -86), (40, -70), (30, -30), (14, -46), (0, -20), (-14, -46), (-30, -30)]),
               self.c("crimson"), "bmane2")
        S.poly(H([(-54, 10), (-30, 0), (-20, 30), (0, 14), (20, 30), (30, 0), (54, 10), (40, 50), (0, 62),
                  (-40, 50)]), self.c("dred"), "bmane3")

    # --- limbs --------------------------------------------------------------------
    def thigh_part(self, S, a, b, d, name):
        S.seg(a, b, self.thigh_w, self.thigh_w * 0.85, self.c("char", d), name)

    def shin_part(self, S, a, b, d, name):
        S.seg(a, b, self.shin_w * 0.8, self.shin_w * 0.75, self.c("dark", d), name)
        m = lerp(a, b, 0.35)
        S.gem(m, self.shin_w * 0.62, self.c("crimson", d), name + ".fur", n=7, squash=0.75)

    def foot(self, S, F, d, name):
        S.poly(F([(-20, -8), (14, -10), (32, 0), (36, 16), (-22, 16)]), self.c("dark", d), name, tags=("ground",))
        S.poly(F([(16, 4), (24, 4), (22, 16), (14, 16)]), self.c("char", d), name + ".split", strength=0.1,
               tags=("ground",))

    def foot_back(self, S, F, d, name):
        S.poly(F([(-22, -8), (22, -8), (26, 16), (-26, 16)]), self.c("dark", d), name, tags=("ground",))

    def upper_part(self, S, a, b, d, name):
        S.seg(a, b, self.upper_w, self.upper_w * 0.9, self.c("char", d), name)

    def fore_part(self, S, a, b, d, name):
        S.seg(a, b, self.fore_w, self.fore_w * 1.05, self.c("dark", d), name)
        S.gem(lerp(a, b, 0.75), self.fore_w * 0.62, self.c("red", d), name + ".cuff", n=6, squash=0.7)

    def hand(self, S, wrist, dv, d, name):
        S.gem(add(wrist, scl(dv, 10)), 20, self.c("char", d), name, n=6)

    def shoulder_pad(self, S, at, angle, d, name):
        F = Frame(at, angle, self.side(name))
        S.poly(F([(-30, -18), (-6, -30), (22, -26), (36, -8), (34, 10), (22, 4), (18, 22), (6, 8), (-6, 20),
                  (-14, 4), (-28, 10), (-34, -4)]), self.c("crimson", d), name)
        S.poly(F([(-12, -18), (14, -18), (26, -4), (8, 2), (-8, -2)]), self.c("red", d), name + ".f")


CHARACTER = Yak()
