import sys, os
from PIL import Image
from rig import build, quantise, OUT
from chars import CHARS

out = sys.argv[1]
ids = sys.argv[2:] or list(CHARS)
os.makedirs(out, exist_ok=True)
for cid in ids:
    poses, climb = build(CHARS[cid](), cid, out)
    quantise(poses).save(f"{out}/{cid}-poses-192.png", optimize=True)
    quantise(climb).save(f"{out}/{cid}-climb-192.png", optimize=True)
    # preview on the game's dark red-brown, 2x nearest
    for name, im in (("poses", poses), ("climb", climb)):
        bg = Image.new("RGBA", im.size, (60, 40, 40, 255))
        bg.alpha_composite(im)
        bg.resize((im.width * 2, im.height * 2), Image.NEAREST).save(f"{out}/prev-{cid}-{name}.png")
print("done")
