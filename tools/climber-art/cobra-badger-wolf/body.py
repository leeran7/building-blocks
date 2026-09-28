"""Skeleton, poses and shared armour parts."""
import math
from rig import *

# World angles in degrees: 0 = hanging straight down, + = swung toward +x
# (the facing direction). Shin/forearm values are relative to their parent.
BASE = dict(lean=3, tilt=0, nT=5, nS=0, fT=-5, fS=0, nU=12, nF=28, fU=-10, fF=26,
            nFoot=0, fFoot=0, tail=0, grounded=True, hip=0.0, px=0.0, nA=1.0, fA=1.0)
POSES = {
    'idle': dict(),
    'run-a': dict(lean=11, tilt=-4, nT=40, nS=-28, fT=-36, fS=-26, nU=-42, nF=62, fU=48, fF=64,
                  nFoot=8, fFoot=-40, tail=-14, hipw=3),
    'run-b': dict(lean=11, tilt=-4, nT=-36, nS=-26, fT=40, fS=-28, nU=48, nF=64, fU=-42, fF=62,
                  nFoot=-40, fFoot=8, tail=10, hipw=3),
    'reach-a': dict(nA=1.3, lean=-2, tilt=-10, nU=172, nF=-6, fU=-6, fF=34, nT=4, nS=0, fT=-14, fS=-30, fFoot=-18, tail=6),
    'reach-b': dict(fA=1.3, lean=-2, tilt=-10, nU=-8, nF=34, fU=-168, fF=8, nT=16, nS=-34, fT=-4, fS=0, nFoot=-12, tail=-6),
    'falling': dict(lean=0, tilt=-6, nU=112, nF=26, fU=-114, fF=-26, nT=44, nS=-18, fT=-44, fS=-14,
                    nFoot=-24, fFoot=18, tail=36, grounded=False, hip=-26, px=4),
    'celebrate': dict(nA=1.15, fA=1.15, lean=-3, tilt=-12, nU=150, nF=22, fU=-150, fF=-22, nT=10, nS=0, fT=-12, fS=0, tail=18),
    'down': dict(lean=30, tilt=24, nT=72, nS=-142, fT=62, fS=-140, nU=16, nF=14, fU=8, fF=18,
                 nFoot=-60, fFoot=-60, tail=-20),
}
ORDER = ['idle', 'run-a', 'run-b', 'reach-a', 'reach-b', 'falling', 'celebrate', 'down']


def pose(name):
    p = dict(BASE); p.update(POSES[name]); return p


class Character:
    """Subclasses set a palette and draw head/tail/torso details."""
    id = 'base'
    bulk = 1.0      # torso width factor
    limb_w = 1.0
    head_scale = 0.8

    def __init__(self):
        self.dk = hexc(self.DARK); self.md = hexc(self.MID); self.ac = hexc(self.ACCENT)
        self.lt = hexc(self.LIGHT); self.eye = hexc(self.EYE)

    # ---- shared armour -------------------------------------------------
    def torso(self, cv, fr, back):
        b = self.bulk
        body = [(-44 * b, 8), (42 * b, 8), (52 * b, -30), (58 * b, -TL + 18), (36 * b, -TL), (-40 * b, -TL),
                (-58 * b, -TL + 16), (-52 * b, -32)]
        if back:
            body = [(-46 * b, 8), (46 * b, 8), (50 * b, -30), (54 * b, -TL + 16), (34 * b, -TL), (-34 * b, -TL),
                    (-54 * b, -TL + 16), (-50 * b, -30)]
        cv.poly(fr, body, self.dk, 'torso', 30)
        # belt
        belt = [(-44 * b, -4), (44 * b, -4), (46 * b, 12), (-44 * b, 12)] if not back else \
            [(-48 * b, -4), (48 * b, -4), (48 * b, 12), (-48 * b, 12)]
        cv.poly(fr, belt, self.md, 'belt', 31, dim=0.8)
        for s in ((-1,) if not back else (-1, 1)):
            cv.poly(fr, [(s * 52 * b, -34), (s * 57 * b, -TL + 22), (s * 42 * b, -TL + 30), (s * 40 * b, -40)], self.ac,
                    f'flank{s}', 31.5, dim=0.8)
        self.torso_detail(cv, fr, back)

    def torso_detail(self, cv, fr, back):
        b = self.bulk
        if back:
            for i in range(3):
                y0 = -TL + 26 + i * 20
                cv.poly(fr, [(0, y0 - 9), (12, y0), (0, y0 + 9), (-12, y0)], self.ac, f'spine{i}', 32, dim=0.85)
            return
        cx = 10
        chev = [(cx - 34 * b, -TL + 18), (cx - 10, -TL + 20), (cx + 4, -TL + 38), (cx + 18, -TL + 20), (cx + 40 * b, -TL + 16),
                (cx + 4, -TL + 60)]
        cv.poly(fr, chev, self.ac, 'chevron', 33)

    def upper_arm(self, cv, fr, near, z, back=False):
        dim = 1.0 if near or back else 0.72
        w = self.limb_w
        cv.poly(fr, [(-18 * w, -6), (18 * w, -8), (15 * w, UL), (-14 * w, UL + 2)], self.dk, f'uarm{near}', z, dim=dim)
        pad = [(-30, -12), (0, -32), (30, -14), (28, 18), (0, 26), (-26, 18)]
        k = 0.78 if near and not back else (0.66 if back else 0.9)
        cv.poly(fr, [(x * w * k, y * k) for x, y in pad], self.ac, f'pad{near}', z + 3, dim=dim)

    def forearm(self, cv, fr, near, z, back=False):
        dim = 1.0 if near or back else 0.72
        w = self.limb_w
        cv.poly(fr, [(-15 * w, -2), (15 * w, -2), (18 * w, FL - 2), (-16 * w, FL)], self.dk, f'farm{near}', z, dim=dim)
        cv.poly(fr, [(-17 * w, FL * 0.3), (18 * w, FL * 0.26), (20 * w, FL * 0.72), (-18 * w, FL * 0.78)], self.ac,
                f'bracer{near}', z + 1, dim=dim * 0.95)
        self.hand(cv, fr.child((0, FL + 12)), near, z + 2, back)

    def hand(self, cv, fr, near, z, back):
        dim = 1.0 if near or back else 0.72
        cv.poly(fr, ngon(0, 0, 21 * self.limb_w, 19, 7, 0.3), self.md, f'hand{near}', z, dim=dim * 0.9)

    def thigh(self, cv, fr, near, z, back=False):
        dim = 1.0 if near or back else 0.72
        w = self.limb_w
        cv.poly(fr, [(-21 * w, -8), (21 * w, -8), (17 * w, THL + 2), (-16 * w, THL + 2)], self.dk, f'thigh{near}', z, dim=dim)
        cv.poly(fr, [(0, THL - 14), (16 * w, THL), (0, THL + 14), (-14 * w, THL)], self.ac, f'knee{near}', z + 2, dim=dim)
        cv.poly(fr, [(-20 * w, -4), (-8 * w, -6), (-12 * w, THL - 16), (-17 * w, THL - 12)], self.ac, f'tstripe{near}', z + 1, dim=dim * 0.85)

    def shin(self, cv, fr, near, z, back=False):
        dim = 1.0 if near or back else 0.72
        w = self.limb_w
        cv.poly(fr, [(-16 * w, -2), (16 * w, -2), (15 * w, SHL), (-15 * w, SHL)], self.dk, f'shin{near}', z, dim=dim * 0.95)
        gx = 0 if back else 4
        cv.poly(fr, [(gx - 9 * w, 4), (gx + 12 * w, 2), (gx + 11 * w, SHL - 8), (gx + 1, SHL - 2), (gx - 8 * w, SHL - 10)],
                self.ac, f'greave{near}', z + 0.5, dim=dim * 0.92)

    def boot(self, cv, fr, near, z, back=False):
        dim = 1.0 if near or back else 0.72
        w = self.limb_w
        if back:
            pts = [(-18 * w, -8), (18 * w, -8), (22 * w, 22), (-22 * w, 22)]
        else:
            pts = [(-20 * w, -10), (16 * w, -12), (32 * w, 0), (42 * w, 12), (41 * w, 22), (-22 * w, 22)]
        cv.poly(fr, pts, self.md, f'boot{near}', z, dim=dim * 0.85)
        cap = [(-14 * w, -6), (14 * w, -6), (12 * w, 6), (-12 * w, 6)] if back else [(16 * w, -10), (32 * w, 0), (40 * w, 10), (22 * w, 8)]
        cv.poly(fr, cap, self.ac, f'toecap{near}', z + 0.5, dim=dim * 0.9)

    # hooks
    def head(self, cv, fr): pass
    def back_head(self, cv, fr): pass
    def tail(self, cv, fr, deg, back): pass
    def behind(self, cv, neck_fr, back): pass  # e.g. hood / ruff behind the torso


def build(ch, p, back=False, climb=None):
    """Return a Canvas for one frame. `climb` = dict of back-view arm/leg values."""
    cv = Canvas()
    b = ch.bulk
    hipY = 370.0 + p['hip']
    lean = math.radians(p['lean'])
    pelvis = Frame((256.0 + p['px'], hipY), lean)
    ch.torso(cv, pelvis, back)
    hs = ch.head_scale
    neck = pelvis.child((6 if not back else 0, -TL + 4), math.radians(p['tilt']), hs, hs)
    ch.behind(cv, neck, back)
    if back:
        ch.back_head(cv, neck)
    else:
        ch.head(cv, neck)
    tail_o = pelvis((-34 * b, 0)) if not back else pelvis((0, 2))
    ch.tail(cv, Frame(tail_o, 0), p['tail'], back)

    if not back:
        shN = pelvis((40 * b, -TL + 14)); shF = pelvis((-46 * b, -TL + 16))
        hw = p.get('hipw')  # runs pull the hips in: a side view has no hip width
        hipN = (pelvis.o[0] + (16 if hw is None else hw), hipY)
        hipF = (pelvis.o[0] - (18 if hw is None else hw), hipY)
        arms = [(shN, p['nU'], p['nF'], True, 70, p['nA']), (shF, p['fU'], p['fF'], False, 10, p['fA'])]
        legs = [(hipN, p['nT'], p['nS'], p['nFoot'], True, 40, 1.0, 1.0),
                (hipF, p['fT'], p['fS'], p['fFoot'], False, 14, 1.0, 1.0)]
    else:
        shR = pelvis((48 * b, -TL + 10)); shL = pelvis((-48 * b, -TL + 10))
        hipR = (pelvis.o[0] + 22, hipY); hipL = (pelvis.o[0] - 22, hipY)
        arms = [(shR, climb['rU'], climb['rF'], True, 70, climb['rA']), (shL, climb['lU'], climb['lF'], True, 71, climb['lA'])]
        legs = [(hipR, climb['rT'], climb['rS'], 0, True, 20, climb['rTs'], climb['rSs']),
                (hipL, climb['lT'], climb['lS'], 0, True, 21, climb['lTs'], climb['lSs'])]
    for o, u, f, near, z, a in arms:
        up = limb(o, u); up.my = a
        ch.upper_arm(cv, up, near, z, back)
        fore = limb(up((0, UL - 2)), u + f); fore.my = a
        ch.forearm(cv, fore, near, z + 1 if not back else z + 1, back)
    for o, t, s, foot, near, z, ts, ss in legs:
        th = limb(o, t); th.my = ts
        ch.thigh(cv, th, near, z, back)
        sh = limb(th((0, THL)), t + s); sh.my = ss
        ch.shin(cv, sh, near, z - 1, back)
        ank = sh((0, SHL))
        ch.boot(cv, Frame(ank, -math.radians(foot)), near, z + 3, back)
    return cv
