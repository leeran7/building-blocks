"""Mantis: chibi insect warrior (triangular head, compound eyes, blade forearms)."""

from climber import Climber
from rig import Frame, add, lerp, norm, scl, sub

P = dict(
    lime="#b3f027",
    green="#5aa832",
    dgreen="#2c5e2a",
    char="#232a25",
    dark="#131a14",
    eye="#eaff6a",
    eyeglow="#c8ff3a",
    wing="#3f7a34",
)


class Mantis(Climber):
    id = "mantis"
    thigh_w = 32.0
    shin_w = 28.0
    upper_w = 26.0
    fore_w = 24.0
    torso_w = 1.35
    shoulder = (16.0, -30.0)
    hip = (12.0, -16.0)
    back_shoulder = 50.0
    back_hip = 24.0

    # Raptorial arms: forearm blades fold back along the upper arm when idle.
    pose_overrides = {
        "idle": dict(nA=(40, 128), fA=(28, 132)),
        "run-a": dict(nA=(-30, 110), fA=(58, 112)),
        "run-b": dict(nA=(60, 112), fA=(-28, 110)),
        "down": dict(nA=(52, 118), fA=(40, 122)),
    }

    def c(self, k, d=1.0):
        return self.col(P[k], d)

    def side(self, name):
        return -1 if name.startswith("backL") else 1

    # --- torso ---------------------------------------------------------------
    def torso(self, S, T, d):
        S.poly(T([(-26, 6), (-32, -40), (-28, -84), (-4, -98), (24, -90), (34, -58), (20, -24), (24, 2), (2, 10)]),
               self.c("char", d), "torso")
        S.poly(T([(-4, -90), (24, -86), (32, -60), (10, -46), (-6, -62)]), self.c("lime", d), "plate1")
        S.poly(T([(-2, -52), (14, -44), (20, -24), (6, -14), (-8, -30)]), self.c("green", d), "plate2")
        S.poly(T([(-28, -6), (26, -4), (28, 8), (-26, 10)]), self.c("dgreen", d), "belt", strength=0.25)

    def torso_back(self, S, T):
        S.poly(T([(-38, 6), (-44, -44), (-34, -88), (0, -100), (34, -88), (44, -44), (38, 6), (0, 12)]),
               self.c("char", 0.95), "tback")
        S.poly(T([(-40, -8), (40, -8), (40, 6), (-40, 8)]), self.c("dgreen"), "beltb", strength=0.25)

    def behind(self, S, T, pose):
        # folded wings lying down the back
        S.poly(T([(-8, -92), (-40, -76), (-52, -26), (-44, 14), (-26, -20)]), self.c("wing", 0.8), "wing1")
        S.poly(T([(-16, -86), (-34, -70), (-40, -30), (-30, -40)]), self.c("lime", 0.7), "wing1v", strength=0.2)

    def behind_back(self, S, T, t):
        pass

    def over_back(self, S, T, t):
        for sx in (-1, 1):
            F = Frame(T.p(0, 0), 0, sx, w=1.2)
            S.poly(F([(1, -92), (26, -84), (34, -36), (22, 16), (4, -6)]), self.c("wing"), f"bwing{sx}")
            S.poly(F([(4, -80), (20, -74), (24, -34), (14, -8), (6, -30)]), self.c("lime", 0.85), f"bwingv{sx}",
                   strength=0.25)

    # --- head --------------------------------------------------------------------
    def antenna(self, S, H, pts, d, name):
        S.curve(H(pts), 7 * H.k, 3 * H.k, self.c("lime", d), name, ow=1.6, strength=0.2)

    def head(self, S, H):
        S.mark("headTop", H.p(0, -84))
        self.antenna(S, H, [(-12, -76), (-42, -92), (-82, -96), (-122, -82)], 0.7, "ant2")
        self.antenna(S, H, [(6, -78), (-28, -96), (-72, -102), (-118, -90)], 1.0, "ant1")
        S.poly(H([(-58, -28), (-44, -70), (0, -86), (46, -74), (70, -40), (62, -4), (40, 30), (20, 58), (6, 64),
                  (-10, 40), (-42, 6)]), self.c("green"), "skull")
        S.poly(H([(-4, -64), (46, -62), (66, -34), (44, 20), (18, 50), (2, 16)]), self.c("lime"), "face")
        S.poly(H([(-40, -30), (-6, -64), (-2, -10), (-30, 0)]), self.c("dgreen"), "cheek")
        S.poly(H([(8, 46), (26, 52), (16, 72), (4, 62)]), self.c("dark"), "mandible", strength=0.15)
        # compound eyes
        S.gem(H.p(-34, -54), 13 * H.k, self.c("eye", 0.8), "eyeF", n=6, squash=1.2)
        S.gem(H.p(42, -48), 20 * H.k, self.c("eye"), "eyeN", n=7, squash=1.15, angle=H.a)
        S.glow(H.p(42, -48), 20, self.c("eyeglow"), 0.8)

    def head_back(self, S, H):
        S.mark("headTop", H.p(0, -84))
        for sx in (-1, 1):
            F = Frame(H.p(0, 0), 0, sx, k=H.k)
            S.curve(F([(12, -76), (40, -96), (78, -104), (116, -92)]), 7 * H.k, 3 * H.k, self.c("lime"),
                    f"bant{sx}", ow=1.6, strength=0.2)
        S.poly(H([(-64, -30), (-46, -72), (0, -88), (46, -72), (64, -30), (40, 24), (0, 56), (-40, 24)]),
               self.c("green", 0.95), "bskull")
        S.poly(H([(-20, -80), (0, -88), (20, -80), (14, 30), (0, 50), (-14, 30)]), self.c("lime", 0.85), "bridge")
        for sx in (-1, 1):
            S.gem(H.p(sx * 50, -48), 12 * H.k, self.c("eye", 0.6), f"beye{sx}", n=6)

    # --- limbs --------------------------------------------------------------------
    def thigh_part(self, S, a, b, d, name):
        S.seg(a, b, self.thigh_w, self.thigh_w * 0.7, self.c("green", d), name)

    def shin_part(self, S, a, b, d, name):
        S.seg(a, b, self.shin_w * 0.8, self.shin_w * 0.6, self.c("dgreen", d), name)
        for i, t in enumerate((0.3, 0.65)):
            m = lerp(a, b, t)
            S.gem(m, self.shin_w * 0.42, self.c("lime", d), f"{name}.s{i}", n=5, squash=0.6)

    def foot(self, S, F, d, name):
        S.poly(F([(-16, -8), (8, -10), (30, 2), (44, 14), (-18, 16)]), self.c("dark", d), name, tags=("ground",))
        S.poly(F([(0, -8), (16, -6), (22, 4), (4, 4)]), self.c("green", d), name + ".c", strength=0.2,
               tags=("ground",))

    def foot_back(self, S, F, d, name):
        S.poly(F([(-18, -8), (18, -8), (22, 16), (-22, 16)]), self.c("dark", d), name, tags=("ground",))

    def upper_part(self, S, a, b, d, name):
        S.seg(a, b, self.upper_w, self.upper_w * 0.8, self.c("green", d), name)

    def fore_part(self, S, a, b, d, name):
        """Raptorial blade: lime edge, serrated inner side, tip past the wrist."""
        dv = norm(sub(b, a))
        n = (-dv[1], dv[0])
        tip = add(b, scl(dv, 30))
        w = self.fore_w / 2
        pts = [add(a, scl(n, w)), add(b, scl(n, w * 0.7)), tip]
        for i, t in enumerate((0.9, 0.75, 0.6, 0.45, 0.3, 0.15)):
            m = lerp(a, tip, t)
            pts.append(sub(m, scl(n, w * (1.7 if i % 2 == 0 else 0.8))))
        pts.append(sub(a, scl(n, w)))
        S.poly(pts, self.c("lime", d), name)
        S.seg(a, lerp(a, b, 0.7), self.fore_w * 0.6, self.fore_w * 0.4, self.c("dgreen", d), name + ".core",
              strength=0.2)

    def hand(self, S, wrist, dv, d, name):
        pass

    def shoulder_pad(self, S, at, angle, d, name):
        F = Frame(at, angle, self.side(name))
        S.poly(F([(-20, -12), (10, -18), (26, -4), (18, 18), (-12, 16)]), self.c("lime", d), name)
        S.poly(F([(-6, 4), (16, 2), (10, 20), (-8, 16)]), self.c("green", d), name + ".f")


CHARACTER = Mantis()
