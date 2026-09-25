# Wraith movement cycles

Final artwork only. Existing Wraith poses and game code are not replaced by this delivery.

| Asset | Frames | Dimensions | Timing |
| --- | --- | --- | --- |
| `wraith-walk.png` | 8, left to right | 4096 × 512 | 100 ms/frame; 800 ms loop |
| `wraith-climb.png` | 6, left to right | 3072 × 512 | 125 ms/frame; 750 ms loop |

Both strips are straight-alpha RGBA PNGs with genuinely transparent backgrounds and untrimmed 512 × 512 cells. There is no ladder, ground shadow, border, or text in the sprites. Each frame has at least 52 pixels of empty margin to the nearest cell edge. No frames are mirrored.

## Animation and placement

`wraith-movement.manifest.json` specifies source rectangles, timings, reduced-motion frames, opaque bounds, and the common root `(256, 460)` in cell pixels. At destination root `(x, y)` and common scale `s`, draw the complete cell at `(x - 256s, y - 460s)` with size `(512s, 512s)`. A 380-pixel reference height is used in the previews. Never fit each frame to its opaque bounds: doing that removes the intended vertical motion and changes character scale.

The side-profile walk faces right throughout: left contact, down, right passing, up, opposite contact, down, left passing, up. It uses alternating opposing arm/leg motion, planted support feet, heel/toe roll, and a controlled body bob from -4 to +5 pixels. The far limbs are darker for depth; they are not mirrored. The walk animates in place, so the engine supplies horizontal movement. To match the support-foot travel, a starting gait calibration is approximately 230 source-image pixels of horizontal movement per second, multiplied by the sprite display scale; synchronize animation speed with movement speed when integrating.

The climb uses the back view. Right-hand reach pairs with left-foot lift, followed by pull and transfer; the second half swaps sides. The hood and torso stay centered, with less than 2 pixels of vertical body bob and no lateral drift. The engine supplies upward world movement. Hands and feet animate relative to a fixed root; raised feet are intentionally above the ground reference.

## Previews and checks

- `wraith-walk-preview.gif` and `wraith-climb-preview.gif` show the loops over the game's volcano texture at 48px, 80px, and 260px reference heights. These are artwork previews, not recordings of the engine.
- `wraith-walk-loop.png` and `wraith-climb-loop.png` are transparent **animated PNGs**, not sprite atlases. They preserve exact 100ms/125ms frame timing. GIF has a 10ms time unit, so the climbing GIF alternates 120ms and 130ms frames to retain the correct 750ms total cycle.
- `validation.json` records final asset hashes, dimensions, alpha ranges, unique-frame counts, margins, source-rectangle round-trip checks, and periodic closure. The next rig sample after the final frame equals the first frame; the strips omit that duplicate endpoint.
- Visually checked contact sheets, light-background edges, and lava previews for stable hood/armor, alternating limb poses, empty gaps, clipping, and camera changes. Checked planted-foot roll against the baseline and last-to-first transitions.

## Source and production

`wraith-side-reference.png` and `wraith-back-reference.png` preserve the matching master views. Built-in image generation produced the reference artwork from `../wraith-poses.png`; user-authorized local processing removed a flat magenta extraction background, graded lime facets toward `#c6f24d`, cut overlapping armor segments, and animated fixed parts with joint rotations and two-segment inverse kinematics. This keeps the costume and proportions stable instead of regenerating them independently in each frame.

Generation prompt: create two full-body orthographic views of the exact existing chibi Wraith, side by side at the same size and foot baseline. Left: strict right-facing side profile, one visible lime eye, visible arm extended forward horizontally for rigging, other arm hidden. Right: centered symmetric back view, hood concealing all facial features, arms down/out in an A pose and legs separated. Preserve the oversized angular hood, short chunky limbs, matte charcoal armor, lime `#c6f24d` facet accents, chevron, layered hip armor, boots, and consistent soft studio lighting. No cape, weapons, labels, scene, borders, or ground shadows. Use a flat magenta intermediate background for local alpha extraction.
