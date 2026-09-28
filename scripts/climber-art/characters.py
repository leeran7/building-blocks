"""Lynx, Bison and Heron: palettes, proportions and head/tail drawers."""

from __future__ import annotations

import math

from rig import (
    Body,
    Canvas,
    Character,
    Palette,
    Pose,
    Vec,
    add,
    default_torso,
    hexrgb,
    mix,
    mul,
    rot,
)


def H(c: Vec, tilt: float, k: float = 1.0):
    """Head-local (pack px, facing right) -> cell coordinates."""

    def f(pts):
        return [add(c, rot((x * k, y * k), tilt)) for x, y in pts]

    return f


def mirror(pts):
    return [(-x, y) for x, y in pts]


def spikes(base: list[Vec], out: list[Vec]):
    """Triangles between consecutive base points with tips at `out`."""
    return [[base[i], out[i], base[i + 1]] for i in range(len(base) - 1)]


# --- Lynx ---------------------------------------------------------------------

LYNX_PAL = Palette(
    body=hexrgb("#3c3a42"),
    dark=hexrgb("#24222a"),
    light=hexrgb("#a9a6b0"),
    accent=hexrgb("#f23db5"),
    accent_dark=hexrgb("#b01070"),
    eye=hexrgb("#ff4fd0"),
    boot=hexrgb("#2a282f"),
    extra={"fur": hexrgb("#5a5862"), "nose": hexrgb("#f27ab8"), "tuft": hexrgb("#141216")},
)


def lynx_head(cv: Canvas, c: Vec, tilt: float, view: str, pal: Palette, b: Body, pose: Pose) -> None:
    T = H(c, tilt, b.head_k)
    fur, tuft = pal.extra["fur"], pal.extra["tuft"]
    if view == "side":
        # far ear, behind the skull
        cv.facet(T([(14, -66), (40, -136), (62, -52)]), mul(fur, 0.8), "ear_f")
        cv.facet(T([(26, -70), (40, -120), (52, -60)]), pal.accent_dark, "ear_fi")
        cv.line(*T([(40, -134), (44, -162)]), tuft, 5)
        # ruff flaring back and down on the near cheek
        base = [(-70, -34), (-84, -4), (-80, 24), (-64, 48), (-40, 64), (-10, 72), (20, 70)]
        out = [(-112, -30), (-116, 10), (-104, 46), (-82, 76), (-50, 94), (-16, 98), (16, 92)]
        for i, t in enumerate(spikes(base, out)):
            cv.facet(T(t), pal.accent if i % 2 == 0 else fur, f"ruff{i}", ring=0.6)
        skull = [(-76, -30), (-58, -62), (-18, -80), (30, -76), (66, -50), (84, -14), (86, 20), (68, 48), (32, 64), (-20, 62), (-62, 40), (-82, 8)]
        cv.facet(T(skull), pal.body, "skull", ring=0.55)
        # forehead stripes
        cv.facet(T([(8, -78), (22, -78), (26, -40), (16, -34)]), pal.accent, "stripe1", ring=0.6)
        cv.facet(T([(32, -74), (44, -70), (40, -40), (32, -40)]), pal.accent, "stripe2", ring=0.6)
        # near ear, in front
        cv.facet(T([(-66, -38), (-58, -140), (-20, -72)]), fur, "ear_n")
        cv.facet(T([(-56, -52), (-56, -118), (-32, -70)]), pal.accent, "ear_ni")
        cv.line(*T([(-58, -138), (-62, -172)]), tuft, 6)
        # face mask and muzzle
        cv.facet(T([(12, 0), (50, -4), (80, 10), (78, 40), (54, 56), (22, 54), (8, 30)]), mix(pal.body, pal.light, 0.45), "mask", ring=0.55)
        cv.facet(T([(38, 12), (80, 6), (98, 24), (84, 44), (50, 44)]), mix(pal.light, (255, 255, 255), 0.3), "muzzle")
        cv.facet(T([(80, 8), (98, 12), (90, 24)]), pal.extra["nose"], "nose", ring=0.7)
        cv.line(*T([(84, 30), (74, 40)]), pal.dark, 3)
        # cheek ruff on the far side, a few spikes past the muzzle
        for i, t in enumerate(spikes([(70, 40), (60, 56), (40, 66)], [(100, 56), (84, 78), (58, 88)])):
            cv.facet(T(t), fur if i % 2 else pal.accent, f"ruffr{i}", ring=0.6)
        cv.eye(T([(26, -14)])[0], 15, 7, tilt - 0.12, pal.eye)
        cv.eye(T([(68, -16)])[0], 10, 6, tilt - 0.12, pal.eye)
        # whiskers
        for dy in (-4, 6):
            cv.line(*T([(78, 30), (116, 24 + dy * 2)]), (230, 230, 236), 1.4, 200, top=True)
    else:
        for s in (-1, 1):
            ear = [(s * 40, -60), (s * 58, -142), (s * 76, -40)]
            cv.facet(T(ear), fur, f"ear{s}")
            cv.line(*T([(s * 58, -140), (s * 62, -172)]), tuft, 6)
            base = [(s * 76, -30), (s * 86, 4), (s * 76, 36), (s * 54, 60), (s * 24, 72)]
            out = [(s * 116, -16), (s * 118, 30), (s * 100, 70), (s * 70, 94), (s * 30, 98)]
            for i, t in enumerate(spikes(base, out)):
                cv.facet(T(t), pal.accent if i % 2 == 0 else fur, f"ruff{s}{i}", ring=0.6)
        skull = [(-80, -20), (-60, -60), (-22, -80), (22, -80), (60, -60), (80, -20), (82, 20), (60, 54), (0, 68), (-60, 54), (-82, 20)]
        cv.facet(T(skull), pal.body, "skullb", ring=0.55)
        for x in (-22, 0, 22):
            cv.facet(T([(x - 6, -76), (x + 6, -76), (x + 3, -30), (x - 3, -30)]), pal.accent, f"bstripe{x}", ring=0.6)


def lynx_tail(cv: Canvas, root: Vec, lean: float, view: str, pal: Palette, pose: Pose) -> None:
    sw = pose.tail * 8
    if view == "side":
        pts = [(0, -8), (-30, -26 + sw), (-44, -30 + sw), (-40, -14 + sw), (0, 8)]
        cv.facet([add(root, rot(p, lean)) for p in pts], pal.extra["fur"], "tail")
        tip = [(-30, -26 + sw), (-46, -36 + sw), (-40, -14 + sw)]
        cv.facet([add(root, rot(p, lean)) for p in tip], pal.extra["tuft"], "tailtip")
    else:
        pts = [(-10, 0), (10, 0), (8 + sw, 40), (-8 + sw, 40)]
        cv.facet([add(root, p) for p in pts], pal.extra["fur"], "tailb")
        cv.facet([add(root, p) for p in [(-8 + sw, 36), (8 + sw, 36), (sw, 52)]], pal.extra["tuft"], "tailbt")


LYNX = Character("lynx", LYNX_PAL, Body(), lynx_head, lynx_tail)


# --- Bison --------------------------------------------------------------------

BISON_PAL = Palette(
    body=hexrgb("#38302f"),
    dark=hexrgb("#221a19"),
    light=hexrgb("#5a4f4d"),
    accent=hexrgb("#f1442a"),
    accent_dark=hexrgb("#9a1a12"),
    eye=hexrgb("#ff6a2a"),
    boot=hexrgb("#262020"),
    extra={"mane": hexrgb("#e2401f"), "mane2": hexrgb("#b52a14"), "horn": hexrgb("#d2aa72"), "muzzle": hexrgb("#2b2526")},
)

BISON_BODY = Body(chest_w=68, waist_w=50, shoulder_w=56, pad=42, limb_w=23, leg_w=24, hand=21, boot_len=48, head_k=0.8, head_up=66)


def bison_head(cv: Canvas, c: Vec, tilt: float, view: str, pal: Palette, b: Body, pose: Pose) -> None:
    T = H(c, tilt, b.head_k)
    mane, mane2, horn = pal.extra["mane"], pal.extra["mane2"], pal.extra["horn"]
    if view == "side":
        # far horn
        cv.facet(T([(50, -46), (92, -60), (112, -96), (106, -126), (96, -92), (74, -70), (46, -60)]), mul(horn, 0.8), "horn_f")
        # mane: a shaggy mass behind the face, spilling onto the shoulders
        n = 14
        ring = []
        for i in range(n):
            t = math.pi * (0.5 + 1.35 * i / (n - 1))
            r = 108 if i % 2 == 0 else 84
            ring.append((r * math.cos(t) - 6, r * math.sin(t) * 0.95 + 8))
        ring += [(10, 92), (60, 96), (96, 60), (60, -70), (20, -84)]
        cv.facet(T(ring), mane2, "mane", ring=0.6)
        for i in range(0, n - 1, 2):
            a = ring[i]
            cv.facet(T([a, (a[0] * 0.55, a[1] * 0.55), ring[i + 1]]), mane if i % 4 == 0 else mix(mane, (255, 160, 60), 0.2), f"tuft{i}", ring=0.6)
        # near horn, curving out left and up
        cv.facet(T([(-24, -44), (-66, -54), (-98, -84), (-104, -128), (-86, -98), (-58, -72), (-22, -62)]), horn, "horn_n", ring=0.5)
        # long dark face, turned right
        face = [(4, -48), (46, -56), (76, -30), (90, 12), (88, 50), (64, 76), (30, 74), (6, 44), (-6, 0)]
        cv.facet(T(face), pal.body, "face", ring=0.55)
        # forelock tuft between the horns
        cv.facet(T([(0, -46), (14, -84), (30, -54), (44, -86), (58, -50), (30, -30)]), mane, "forelock", ring=0.6)
        # beard under the chin
        for i, t in enumerate(spikes([(20, 70), (44, 78), (70, 80), (92, 70)], [(20, 108), (48, 118), (78, 112)])):
            cv.facet(T(t), mane if i % 2 == 0 else mane2, f"beard{i}", ring=0.6)
        # muzzle and nostrils
        cv.facet(T([(38, 40), (92, 32), (104, 58), (84, 82), (44, 78)]), pal.extra["muzzle"], "muzzle", ring=0.55)
        cv.facet(T([(80, 46), (92, 44), (92, 54), (82, 56)]), (14, 10, 10), "nos1", ring=0.8)
        cv.facet(T([(62, 50), (72, 48), (72, 58), (64, 58)]), (14, 10, 10), "nos2", ring=0.8)
        # brow ridge, then angry eyes
        cv.facet(T([(8, -22), (86, -26), (84, -12), (10, -8)]), pal.dark, "brow", ring=0.6)
        cv.eye(T([(34, 2)])[0], 13, 6, tilt - 0.15, pal.eye)
        cv.eye(T([(74, -2)])[0], 9, 5, tilt - 0.15, pal.eye)
    else:
        for s in (-1, 1):
            cv.facet(T([(s * 40, -40), (s * 86, -54), (s * 116, -90), (s * 118, -128), (s * 100, -94), (s * 72, -70), (s * 36, -58)]), horn, f"hornb{s}", ring=0.5)
        n = 16
        ring = []
        for i in range(n):
            t = math.pi * (0.9 + 1.2 * i / (n - 1))
            r = 100 if i % 2 == 0 else 80
            ring.append((r * math.cos(t), r * math.sin(t) * 0.9 + 10))
        ring += [(70, 60), (0, 84), (-70, 60)]
        cv.facet(T(ring), mane2, "maneb", ring=0.6)
        for i in range(0, n - 1, 2):
            a = ring[i]
            cv.facet(T([a, (a[0] * 0.5, a[1] * 0.5), ring[i + 1]]), mane, f"tuftb{i}", ring=0.6)


def bison_tail(cv: Canvas, root: Vec, lean: float, view: str, pal: Palette, pose: Pose) -> None:
    sw = pose.tail * 6
    if view == "side":
        pts = [(0, -4), (-26, 10 + sw), (-30, 30 + sw), (-24, 32 + sw), (-18, 12 + sw), (0, 6)]
        cv.facet([add(root, rot(p, lean)) for p in pts], pal.dark, "tail")
        cv.facet([add(root, rot(p, lean)) for p in [(-22, 24 + sw), (-38, 48 + sw), (-18, 44 + sw)]], pal.extra["mane"], "tailtip")
    else:
        cv.facet([add(root, p) for p in [(-5, 0), (5, 0), (4 + sw, 30), (-4 + sw, 30)]], pal.dark, "tailb")
        cv.facet([add(root, p) for p in [(-10 + sw, 28), (10 + sw, 28), (sw, 50)]], pal.extra["mane"], "tailbt")


def bison_torso(cv: Canvas, f, view: str, pal: Palette, b: Body) -> None:
    default_torso(cv, f, view, pal, b)
    # shoulder hump of mane over the upper back
    pts = [(-b.chest_w * 1.05, -b.torso_len * 0.72), (-b.chest_w * 0.6, -b.torso_len * 1.12), (0, -b.torso_len * 1.06), (-b.chest_w * 0.3, -b.torso_len * 0.8)]
    if view != "side":
        pts = [(-b.chest_w * 0.9, -b.torso_len * 0.86), (0, -b.torso_len * 1.15), (b.chest_w * 0.9, -b.torso_len * 0.86), (0, -b.torso_len * 0.7)]
    cv.facet([add(f.pelvis, rot(p, f.lean)) for p in pts], pal.extra["mane2"], "hump", ring=0.55)


def bison_pauldron(cv: Canvas, sh: Vec, lean: float, near: bool, key: str, pal: Palette, b: Body) -> None:
    r = b.pad * (1.0 if near else 0.85)
    col = pal.extra["mane"] if near else mul(pal.extra["mane"], 0.78)
    pts = []
    for i in range(9):
        t = math.pi * (0.95 + 1.1 * i / 8)
        rr = r * (1.18 if i % 2 == 0 else 0.86)
        pts.append(add(sh, rot((rr * math.cos(t), rr * 0.85 * math.sin(t)), lean)))
    pts.append(add(sh, rot((r * 0.9, r * 0.4), lean)))
    pts.append(add(sh, rot((-r * 0.9, r * 0.5), lean)))
    cv.facet(pts, col, key, ring=0.55)


def bison_boot(cv: Canvas, ankle: Vec, ang: float, side: bool, key: str, pal: Palette, b: Body) -> None:
    L = b.boot_len
    if side:
        pts = [(-L * 0.45, -16), (L * 0.25, -16), (L * 0.58, 0), (L * 0.62, 20), (-L * 0.48, 20)]
    else:
        pts = [(-L * 0.4, -16), (L * 0.4, -16), (L * 0.46, 20), (-L * 0.46, 20)]
    cv.facet([add(ankle, rot(p, ang)) for p in pts], pal.boot, key, ring=0.5)
    # cloven hoof split
    cv.line(add(ankle, rot((L * 0.3 if side else 0, 6), ang)), add(ankle, rot((L * 0.36 if side else 0, 20), ang)), (10, 8, 8), 3)


BISON = Character("bison", BISON_PAL, BISON_BODY, bison_head, bison_tail, bison_torso, bison_pauldron, bison_boot)


# --- Heron --------------------------------------------------------------------

HERON_PAL = Palette(
    body=hexrgb("#34373f"),
    dark=hexrgb("#1c1f26"),
    light=hexrgb("#e6e8ec"),
    accent=hexrgb("#3b93e6"),
    accent_dark=hexrgb("#1850a8"),
    eye=hexrgb("#4fb0ff"),
    boot=hexrgb("#7d7a70"),
    extra={"white": hexrgb("#e8eaee"), "grey": hexrgb("#9da1aa"), "beak": hexrgb("#f0b030"), "beak2": hexrgb("#c07818"), "stripe": hexrgb("#15161b")},
)

HERON_BODY = Body(chest_w=52, waist_w=40, shoulder_w=46, leg_w=14, limb_w=17, thigh=46, shin=44, boot_len=50, head_k=0.9, head_up=74)


def heron_head(cv: Canvas, c: Vec, tilt: float, view: str, pal: Palette, b: Body, pose: Pose) -> None:
    T = H(c, tilt, b.head_k)
    white, grey, stripe = pal.extra["white"], pal.extra["grey"], pal.extra["stripe"]
    plumes = [
        [(-30, -44), (-132, -108), (-20, -60)],
        [(-38, -30), (-148, -70), (-30, -48)],
        [(-40, -14), (-138, -30), (-36, -32)],
        [(-20, -56), (-96, -130), (-6, -66)],
    ]
    if view == "side":
        for i, p in enumerate(plumes):
            cv.facet(T(p), pal.accent if i % 2 == 0 else pal.accent_dark, f"plume{i}", ring=0.6)
        neck = [(-34, 20), (26, 26), (34, 70), (-40, 70)]
        cv.facet(T(neck), white, "neck", ring=0.5)
        cv.facet(T([(2, 30), (12, 30), (14, 70), (2, 70)]), stripe, "neckstripe", ring=0.6)
        base = [(-52, 58), (-30, 64), (-8, 68), (14, 68), (36, 62)]
        out = [(-58, 96), (-34, 104), (-6, 106), (20, 102), (44, 92)]
        for i, t in enumerate(spikes(base, out)):
            cv.facet(T(t), white if i % 2 else grey, f"collar{i}", ring=0.6)
        skull = [(-52, -34), (-26, -60), (22, -62), (54, -40), (64, -8), (52, 22), (12, 40), (-34, 36), (-58, 6)]
        cv.facet(T(skull), white, "skull", ring=0.55)
        cv.facet(T([(-50, -26), (-20, -50), (10, -40), (-40, -6)]), grey, "cap", ring=0.55)
        # beak: upper and lower mandible
        cv.facet(T([(48, -22), (100, -18), (176, -4), (100, 0), (52, 2)]), pal.extra["beak"], "beaku", ring=0.5)
        cv.facet(T([(52, 2), (100, 0), (176, -4), (100, 12), (50, 14)]), pal.extra["beak2"], "beakl", ring=0.5)
        # black stripe from the eye back over the head
        cv.facet(T([(6, -24), (44, -22), (38, -10), (-10, -6), (-46, -18), (-30, -28)]), stripe, "stripe", ring=0.6)
        cv.eye(T([(28, -16)])[0], 12, 6, tilt - 0.08, pal.eye)
    else:
        for i, p in enumerate(plumes):
            for s in (-1, 1):
                q = [(s * abs(x) * 0.7, y) for x, y in p]
                cv.facet(T(q), pal.accent if i % 2 == 0 else pal.accent_dark, f"plumeb{i}{s}", ring=0.6)
        cv.facet(T([(-34, 24), (34, 24), (40, 70), (-40, 70)]), white, "neckb", ring=0.5)
        base = [(-52, 58), (-26, 66), (0, 68), (26, 66), (52, 58)]
        out = [(-60, 96), (-30, 104), (0, 108), (30, 104), (60, 96)]
        for i, t in enumerate(spikes(base, out)):
            cv.facet(T(t), white if i % 2 else grey, f"collarb{i}", ring=0.6)
        skull = [(-56, -30), (-30, -60), (30, -60), (56, -30), (60, 6), (36, 36), (-36, 36), (-60, 6)]
        cv.facet(T(skull), white, "skullb", ring=0.55)
        cv.facet(T([(-4, -60), (4, -60), (4, 70), (-4, 70)]), stripe, "stripeb", ring=0.6)


def heron_tail(cv: Canvas, root: Vec, lean: float, view: str, pal: Palette, pose: Pose) -> None:
    sw = pose.tail * 5
    if view == "side":
        for i, (tx, ty) in enumerate([(-54, 24), (-58, 8), (-50, 38)]):
            pts = [(0, -8), (tx, ty + sw), (-6, 12)]
            cv.facet([add(root, rot(p, lean)) for p in pts], pal.accent_dark if i else pal.extra["grey"], f"tailf{i}")
    else:
        for i, tx in enumerate((-22, 0, 22)):
            pts = [(-8, 0), (tx + sw, 46), (8, 0)]
            cv.facet([add(root, p) for p in pts], pal.accent_dark if i != 1 else pal.extra["grey"], f"tailb{i}")


def heron_pauldron(cv: Canvas, sh: Vec, lean: float, near: bool, key: str, pal: Palette, b: Body) -> None:
    """Layered feathers: three blades fanning down and back."""
    dim = 1.0 if near else 0.78
    cols = [pal.extra["grey"], pal.accent, pal.accent_dark]
    for i, (a, L) in enumerate(((-0.2, 40), (0.35, 46), (0.9, 40))):
        d = rot((0, 1), a + math.pi * 0.25)
        n = (-d[1], d[0])
        root = add(sh, rot((-4 + i * 4, -12 + i * 6), lean))
        tip = add(root, (d[0] * L, d[1] * L))
        pts = [add(root, (n[0] * 14, n[1] * 14)), tip, add(root, (-n[0] * 14, -n[1] * 14)), add(root, (-d[0] * 10, -d[1] * 10))]
        cv.facet(pts, mul(cols[i], dim), f"{key}{i}", ring=0.5)


def heron_boot(cv: Canvas, ankle: Vec, ang: float, side: bool, key: str, pal: Palette, b: Body) -> None:
    """Armoured bird foot: a cuff and three toes."""
    cv.facet([add(ankle, rot(p, ang)) for p in [(-12, -14), (12, -14), (14, 8), (-14, 8)]], mul(pal.body, 1.1), key + "c", ring=0.5)
    toes = [(34, 18), (14, 20), (-22, 18)] if side else [(-24, 20), (0, 22), (24, 20)]
    for i, t in enumerate(toes):
        cv.facet([add(ankle, rot(p, ang)) for p in [(-6, 4), (6, 4), t]], pal.boot, f"{key}t{i}", ring=0.6)


HERON = Character("heron", HERON_PAL, HERON_BODY, heron_head, heron_tail, None, heron_pauldron, heron_boot, leg_col=hexrgb("#8d8a80"))

ALL = [LYNX, BISON, HERON]
