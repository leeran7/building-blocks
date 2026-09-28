"""Build climber sheets: python3 build.py <id> [<id> ...] [--out DIR] [--preview DIR]

Writes <id>-poses-192.png and <id>-climb-192.png (app/public/climb/ by default)
and, with --preview, a contact sheet over the volcano tile.
"""

import argparse
import importlib
import os

from PIL import Image, ImageDraw

import rig

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CLIMB = os.path.join(REPO, "app", "public", "climb")


def preview(cid, poses, strip, out_dir):
    tile = Image.open(os.path.join(CLIMB, "volcano-tile.jpg")).convert("RGBA")
    W, H = 1200, 760
    bg = Image.new("RGBA", (W, H))
    for x in range(0, W, tile.width):
        for y in range(0, H, tile.height):
            bg.paste(tile, (x, y))
    bg.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 90)))
    d = ImageDraw.Draw(bg)
    bg.alpha_composite(poses, (10, 10))
    bg.alpha_composite(strip.resize((768, 128), Image.LANCZOS), (10, 400))
    # game size: the figure draws ~30 CSS px tall, so 40-100 device px
    y = 10
    for h in (40, 64, 100):
        k = h / 142.5
        small = poses.resize((int(768 * k), int(384 * k)), Image.LANCZOS)
        bg.alpha_composite(small, (800, y))
        d.text((800, y + small.height - 10), f"{h}px", fill=(255, 255, 255, 255))
        y += small.height + 8
    y = 560
    for h in (40, 64, 100):
        k = h / 142.5
        small = strip.resize((int(1152 * k), int(192 * k)), Image.LANCZOS)
        bg.alpha_composite(small, (10, y))
        y += small.height + 4
    bg.convert("RGB").save(os.path.join(out_dir, f"{cid}-preview.png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--out", default=CLIMB)
    ap.add_argument("--preview")
    a = ap.parse_args()
    for cid in a.ids:
        mod = importlib.import_module(cid)
        poses, strip, _, _ = rig.build(mod.draw, mod.RIG)
        rig.quantise(poses).save(os.path.join(a.out, f"{cid}-poses-192.png"), optimize=True)
        rig.quantise(strip).save(os.path.join(a.out, f"{cid}-climb-192.png"), optimize=True)
        if a.preview:
            preview(cid, poses, strip, a.preview)
        print(cid, "ok")


if __name__ == "__main__":
    main()
