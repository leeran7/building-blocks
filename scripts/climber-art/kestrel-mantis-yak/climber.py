"""Shared skeleton, poses and limb drawing for rigged climbers.

A character subclasses Climber, sets its palette and proportions, and draws
its own head, torso, hands, feet and extras (tail, wings, mantle). The base
class poses the skeleton for the eight poses-sheet cells (three-quarter view,
facing right) and the six back-view climb frames.
"""

from __future__ import annotations

import math

import climb_cycle
from rig import ANCHOR, Frame, Scene, add, dirv, hexc, ik, mul, rot, scl, sub

FAR = 0.7  # colour multiplier for the far arm and leg (depth)

# Poses-sheet cells, row-major: idle, run-a, run-b, reach-a, reach-b, falling,
# celebrate, down. arms: (shoulder, elbow); legs: (hip, knee, foot).
POSES = [
    dict(name="idle", torso=3, head=0, nA=(14, 24), fA=(-12, 22), nL=(10, 6, 0), fL=(-9, 6, 0)),
    # Two mirrored strides, both feet down: the engine adds the bob between them
    dict(name="run-a", torso=11, head=-4, nA=(-48, 55), fA=(52, 75), nL=(40, 28, -8), fL=(-40, 36, 30)),
    dict(name="run-b", torso=11, head=-4, nA=(55, 75), fA=(-44, 55), nL=(-40, 36, 30), fL=(40, 28, -8)),
    dict(name="reach-a", torso=-2, head=-10, nA=(104, 58), fA=(14, 26), nL=(4, 4, 0), fL=(28, 62, 4)),
    dict(name="reach-b", torso=-2, head=-10, nA=(12, 26), fA=(-104, -58), nL=(28, 62, 4), fL=(-4, 4, 0)),
    dict(name="falling", torso=-6, head=-12, nA=(118, -20), fA=(-116, 20), nL=(34, 36, -14), fL=(-26, 40, 18), lift=10),
    dict(name="celebrate", torso=-4, head=-12, nA=(100, 58), fA=(-100, -58), nL=(12, 2, 0), fL=(-12, 2, 0), lift=8),
    dict(name="down", torso=16, head=8, nA=(30, 30), fA=(20, 34), nL=(70, 128, 0), fL=(10, 120, 30), pelvis=10),
]


class Climber:
    id = "base"
    # proportions (512-cell design units, before the fit scale)
    foot_h = 18.0
    thigh = 46.0
    shin = 46.0
    torso_len = 90.0
    head_off = 66.0
    head_k = 0.9  # head drawing scale
    upper = 48.0
    fore = 44.0
    thigh_w = 38.0
    shin_w = 34.0
    upper_w = 30.0
    fore_w = 28.0
    torso_w = 1.3  # torso polygon width multiplier
    shoulder = (16.0, -28.0)  # near / far shoulder x offset (torso frame)
    hip = (11.0, -15.0)
    back_shoulder = 48.0
    back_hip = 22.0
    hand_out = 30.0  # back view: hands this far outside the shoulders

    outline = "#0a0b0e"
    pose_overrides: dict = {}

    def __init__(self):
        self.o = hexc(self.outline)

    # --- helpers ----------------------------------------------------------
    def col(self, c, depth: float = 1.0):
        c = hexc(c) if isinstance(c, str) else c
        return mul(c, depth)

    # --- parts every character supplies -------------------------------------
    def torso(self, S: Scene, T: Frame, depth: float): ...
    def torso_back(self, S: Scene, T: Frame): ...
    def head(self, S: Scene, H: Frame): ...
    def head_back(self, S: Scene, H: Frame): ...
    def thigh_part(self, S, a, b, depth, name): ...
    def shin_part(self, S, a, b, depth, name): ...
    def foot(self, S: Scene, F: Frame, depth: float, name: str): ...
    def foot_back(self, S: Scene, F: Frame, depth: float, name: str): ...
    def upper_part(self, S, a, b, depth, name): ...
    def fore_part(self, S, a, b, depth, name): ...
    def hand(self, S: Scene, wrist: Pt, d: Pt, depth: float, name: str): ...
    def shoulder_pad(self, S: Scene, at: Pt, angle: float, depth: float, name: str): ...
    def behind(self, S: Scene, T: Frame, pose: dict): ...
    def behind_back(self, S: Scene, T: Frame, t: int): ...
    def over_back(self, S: Scene, T: Frame, t: int): ...

    # --- limbs --------------------------------------------------------------
    def leg(self, S, hip, h, k, fa, depth, name):
        knee = add(hip, scl(dirv(h), self.thigh))
        ankle = add(knee, scl(dirv(h - k), self.shin))
        self.thigh_part(S, hip, knee, depth, name + ".thigh")
        self.shin_part(S, knee, ankle, depth, name + ".shin")
        self.foot(S, Frame(ankle, fa), depth, name + ".foot")

    def arm(self, S, sh, s, e, depth, name):
        elbow = add(sh, scl(dirv(s), self.upper))
        wrist = add(elbow, scl(dirv(s + e), self.fore))
        self.upper_part(S, sh, elbow, depth, name + ".upper")
        self.fore_part(S, elbow, wrist, depth, name + ".fore")
        self.hand(S, wrist, dirv(s + e), depth, name + ".hand")

    # --- three-quarter pose ---------------------------------------------------
    def build(self, pose: dict) -> Scene:
        pose = {**pose, **self.pose_overrides.get(pose["name"], {})}
        S = Scene(self.o)
        pelvis = (256.0, 330.0 + pose.get("pelvis", 0))
        T = Frame(pelvis, pose["torso"])
        neck = T.p(0, -self.torso_len)
        H = Frame(add(neck, rot((0, -self.head_off), pose["torso"])), pose["torso"] + pose["head"], k=self.head_k)
        shN = T.p(self.shoulder[0], -self.torso_len + 16)
        shF = T.p(self.shoulder[1], -self.torso_len + 12)
        hipN = T.p(self.hip[0], -2)
        hipF = T.p(self.hip[1], -4)

        self.arm(S, shF, *pose["fA"], FAR, "farArm")
        self.shoulder_pad(S, shF, pose["torso"], FAR, "farPad")
        self.behind(S, T, pose)
        self.leg(S, hipF, *pose["fL"], FAR, "farLeg")
        self.torso(S, Frame(pelvis, pose["torso"], w=self.torso_w), 1.0)
        self.leg(S, hipN, *pose["nL"], 1.0, "nearLeg")
        self.head(S, H)
        self.arm(S, shN, *pose["nA"], 1.0, "nearArm")
        self.shoulder_pad(S, shN, pose["torso"], 1.0, "nearPad")
        return S

    # --- back-view climb frame ------------------------------------------------
    def build_back(self, t: int, frames: int = 6) -> Scene:
        """Frame t of the shared climb cycle: hand over hand, opposite foot steps."""
        S = Scene(self.o)
        pelvis = (256.0, 330.0)
        T = Frame(pelvis, 0)
        neck = T.p(0, -self.torso_len)
        H = Frame(add(neck, (0, -self.head_off)), 0, k=self.head_k)
        shL = T.p(-self.back_shoulder, -self.torso_len + 16)
        shR = T.p(self.back_shoulder, -self.torso_len + 16)
        hipL = T.p(-self.back_hip, -2)
        hipR = T.p(self.back_hip, -2)
        ground = pelvis[1] + self.thigh + self.shin - 6  # ankle height, knees slightly bent
        hand_top = neck[1] - 90
        # The shared hand-over-hand cycle (tools/climber-art/climb_cycle.py).
        hands, feet = {}, {}
        for side, sgn, cside in (("R", 1, "r"), ("L", -1, "l")):
            drop, out, _ = climb_cycle.hand(t, cside)
            hands[side] = (256 + sgn * (self.back_shoulder + self.hand_out + out), hand_top + drop)
            lift, _ = climb_cycle.foot(t, cside)
            feet[side] = (256 + sgn * (self.back_hip + 12), ground - lift)

        # legs (behind the torso), knees bend outward
        for side, hip, bend in (("L", hipL, 1), ("R", hipR, -1)):
            knee, ankle = ik(hip, feet[side], self.thigh, self.shin, bend)
            self.thigh_part(S, hip, knee, 0.92, f"back{side}.thigh")
            self.shin_part(S, knee, ankle, 0.92, f"back{side}.shin")
            self.foot_back(S, Frame(ankle, 0, 1 if side == "R" else -1), 0.92, f"back{side}.foot")
        # arms reach toward the ladder, so draw them before the body
        for side, sh, bend in (("L", shL, -1), ("R", shR, 1)):
            elbow, wrist = ik(sh, hands[side], self.upper, self.fore, bend)
            self.upper_part(S, sh, elbow, 0.88, f"back{side}.upper")
            self.fore_part(S, elbow, wrist, 0.88, f"back{side}.fore")
            self.hand(S, wrist, (0.0, -1.0), 0.88, f"back{side}.hand")
        self.behind_back(S, T, t)
        self.torso_back(S, Frame(pelvis, 0, w=self.torso_w))
        self.shoulder_pad(S, shL, 0, 0.95, "backL.pad")
        self.shoulder_pad(S, shR, 0, 0.95, "backR.pad")
        self.head_back(S, H)
        self.over_back(S, T, t)
        return S


Pt = tuple
