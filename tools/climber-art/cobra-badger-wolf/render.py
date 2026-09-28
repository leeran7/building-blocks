"""Render sheets + previews: python3 render.py <id> [outdir]"""
import sys, os, math
from PIL import Image
from rig import *
from body import build, pose, ORDER
from chars import CHARS

import climb_cycle

GROUND = ('boot', 'shin', 'thigh', 'knee', 'hand')


def lowest(cv):
    ys = [it['fr'].world(p)[1] for it in cv.items if it['name'].startswith(GROUND) for p in it['lp']]
    return max(ys)


def climb_params(ch, i):
    """Frame i of the shared hand-over-hand cycle (../climb_cycle.py), as joint values."""
    hipY = 370.0
    cp = dict(bob=0.0)
    for s, side, sgn in (("r", "r", 1), ("l", "l", -1)):
        sh = (256.0 + sgn * 48 * ch.bulk, hipY - TL + 10)
        drop, out, _ = climb_cycle.hand(i, side)
        hand = (sh[0] + sgn * (34 + out), sh[1] - 128 + drop)
        el, hd, st = climb_cycle.ik(sh, hand, UL - 2, FL, -sgn)
        u = climb_cycle.limb_deg(sh, el)
        cp[s + 'U'], cp[s + 'F'], cp[s + 'A'] = u, climb_cycle.limb_deg(el, hd) - u, st
        # a lifted leg comes toward the viewer: fold the knee out and foreshorten
        lift = climb_cycle.foot(i, side)[0] / climb_cycle.LIFT_MAX
        cp[s + 'T'] = sgn * lerp(4, 24, lift)
        cp[s + 'S'] = -sgn * lerp(0, 22, lift)
        cp[s + 'Ts'] = 1 - 0.62 * lift
        cp[s + 'Ss'] = 1 - 0.25 * lift
    return cp


def main(cid, out):
    ch = CHARS[cid]()
    idle = build(ch, pose('idle'))
    dy0 = AY - lowest(idle)
    top = idle.bounds()[1] + dy0
    scale = REF_H / (AY - top)
    cells = []
    for name in ORDER:
        p = pose(name)
        cv = build(ch, p)
        dy = AY - lowest(cv) if p['grounded'] else dy0
        cells.append(rasterise(cv, scale, dy))
    # height check on the real raster
    t, b = opaque_rows(cells[0])
    print(cid, 'scale %.3f' % scale, 'idle rows', t / (RPX / PACK), b / (RPX / PACK))
    climb = []
    base = pose('idle'); base.update(lean=0, tilt=-4)
    c0 = build(ch, base, back=True, climb=climb_params(ch, 0))
    dyc = AY - lowest(c0)
    for i in range(climb_cycle.FRAMES):
        cp = climb_params(ch, i)
        cv = build(ch, base, back=True, climb=cp)
        climb.append(rasterise(cv, scale, dyc + cp['bob']))
    poses = Image.new('RGBA', (CELL * 4, CELL * 2), (0, 0, 0, 0))
    for k, c in enumerate(cells):
        poses.paste(c.resize((CELL, CELL), Image.LANCZOS), ((k % 4) * CELL, (k // 4) * CELL))
    strip = Image.new('RGBA', (CELL * 6, CELL), (0, 0, 0, 0))
    for k, c in enumerate(climb):
        strip.paste(c.resize((CELL, CELL), Image.LANCZOS), (k * CELL, 0))
    os.makedirs(out, exist_ok=True)
    poses.save(f'{out}/{cid}-poses-192-rgba.png'); strip.save(f'{out}/{cid}-climb-192-rgba.png')
    for img, nm in ((poses, 'poses'), (strip, 'climb')):
        q = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q.save(f'{out}/{cid}-{nm}-192.png', optimize=True)
        bg = Image.new('RGBA', img.size, (74, 70, 96, 255)); bg.alpha_composite(img)
        bg.save(f'{out}/{cid}-{nm}-preview.png')
    print('sizes', os.path.getsize(f'{out}/{cid}-poses-192.png'), os.path.getsize(f'{out}/{cid}-climb-192.png'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'out')
