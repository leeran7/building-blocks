# Wraith gameplay artwork

`wraith-poses.png` is the finished 2048 × 1024 RGBA sprite sheet: two rows of four untrimmed 512 × 512 cells. Its background has actual zero-alpha pixels. Every pose faces three-quarter right; no frame is mirrored.

Read cells left to right, then top to bottom: **Idle, Run A, Run B, Reach A, Reach B, Falling, Celebrate, Down**. Run B was generated separately to alternate the stride rather than repeat Run A. Reach frames alternate the raised arm. Accent facets are graded toward `#c6f24d`.

## Integration contract

Use `wraith-poses.manifest.json` for exact rectangles, the `(256, 460)` foot anchor, animation timing, and reduced-motion frame choices. At draw position `(x, y)` and scale `s`, the unflipped destination rectangle is `(x - 256s, y - 460s, 512s, 512s)`. Choose one scale from the idle figure's 380-pixel visible height and keep it for all poses. Do not independently resize each pose to its opaque bounds: the crouch must remain shorter. Reflect around the foot anchor in-engine for left-facing movement.

The manifest uses the existing renderer's state names: `idle`, `walk`, `climb`, `air`, `done`, and `dead`. Its two-frame walk cycle uses 160 ms per frame; climbing uses 220 ms. These are deliberately stylized two-frame loops. Single-frame states hold their pose. Jetpack flames can be layered separately with the airborne pose.

## Verification

- Reopened the exported PNG and confirmed 2048 × 1024, RGBA, and an alpha range of 0–255.
- Checked all eight source rectangles against their packed frames, transparent corners and gutters, and a common bottom baseline of 460 within each cell.
- Checked the walk and reach pairs contain different image data; visually checked their opposite limb poses and consistent right-facing direction.
- Checked edges on light and dark backgrounds and removed residual magenta fringe.
- Previewed all states over the game's volcano texture at 48, 80, and 144 pixels of idle character height. `wraith-animation-preview.gif` is this review preview, not an engine recording.

This delivery contains artwork and metadata only. The game renderer has not been changed or integrated with the sheet. The earlier `wraith-poses-draft.png` is retained as a draft and is not referenced by the final manifest.

## Production method and prompts

Artwork was created with the built-in image-generation tool using the existing `app/mobile/src/assets/avatars/wraith.webp` identity reference. With the user's explicit authorization, local processing removed a flat magenta intermediate background, corrected edge colors, normalized frame placement, and packed the actual transparent PNG. No character frames were mirrored.

Sheet prompt: one 4 × 2 sheet of the same chibi hooded low-poly warrior, big head and short chunky limbs, charcoal armor, lime `#c6f24d` accents and chest chevron, glowing eyes, fixed three-quarter right-facing view. Ordered poses: idle, running with one stride, opposite running stride, right-arm overhead reach, left-arm overhead reach, falling with limbs spread, both-arm celebration, crouched down. Constant character scale, generous separation, no text, scene, border, or ground shadow. Pure flat magenta intermediate background for local alpha extraction.

Run B correction prompt: the same right-facing character, with the near leg bent backward and boot kicked behind to image left, the far leg forward toward image right, the near arm swinging forward across the chest and the far arm behind. Preserve hood, face angle, costume, proportions, and lighting. A single centered sprite on the same flat magenta extraction background, with no shadow or text.
