"""Put a grounded pose's feet on the foot anchor, shared by the climber rigs.

The contract (app/public/climb/README.md) pins the point between the feet to
(96, 172.5) of the 192 cell, so a standing or running figure's soles sit on
row 172, like the Wraith's. Some rigs aim a planted foot at a target the leg
cannot reach, so the figure floats a few pixels up in some frames; in the
two-frame walk that reads as a hop on every other step. snap() moves a
finished 192 cell so its lowest opaque row is row 172.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

SOLE_ROW = 172  # lowest opaque row of a grounded 192 cell (the Wraith's)
ALPHA = 40


def snap(cell: Image.Image, sole_row: int = SOLE_ROW) -> Image.Image:
    """Shift a grounded cell vertically so its lowest opaque row is sole_row."""
    a = np.array(cell.getchannel("A"))
    rows = np.where(a.max(1) > ALPHA)[0]
    if len(rows) == 0:
        return cell
    dy = sole_row - int(rows[-1])
    if dy == 0:
        return cell
    out = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    if dy > 0:
        out.alpha_composite(cell.crop((0, 0, cell.width, cell.height - dy)), (0, dy))
    else:
        out.alpha_composite(cell.crop((0, -dy, cell.width, cell.height)), (0, 0))
    return out
